use clap::{Parser, Subcommand};
use regex::Regex;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Command;
use unicode_width::UnicodeWidthStr;

#[derive(Parser)]
#[command(name = "council", about = "CLI tools for Council advisor distillation and validation")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Download YouTube subtitles via yt-dlp
    DownloadSubtitles {
        /// YouTube URL
        url: String,
        /// Output directory (default: current directory)
        #[arg(short, long, default_value = ".")]
        output_dir: PathBuf,
    },
    /// Clean SRT/VTT subtitle file to plain text transcript
    CleanTranscript {
        /// Input SRT or VTT file
        input: PathBuf,
        /// Output file (default: <stem>_transcript.txt)
        #[arg(short, long)]
        output: Option<PathBuf>,
    },
    /// Generate Phase 1.5 research summary table
    MergeResearch {
        /// Path to the skill directory
        skill_dir: PathBuf,
    },
    /// Validate a generated SKILL.md against quality standards
    QualityCheck {
        /// Path to the SKILL.md file to validate
        skill_md: PathBuf,
    },
}

fn main() {
    let cli = Cli::parse();
    let exit_code = match cli.command {
        Commands::DownloadSubtitles { url, output_dir } => download_subtitles(&url, &output_dir),
        Commands::CleanTranscript { input, output } => clean_transcript(&input, output.as_deref()),
        Commands::MergeResearch { skill_dir } => merge_research(&skill_dir),
        Commands::QualityCheck { skill_md } => quality_check(&skill_md),
    };
    std::process::exit(exit_code);
}

// ---------------------------------------------------------------------------
// Subcommand: download-subtitles
// ---------------------------------------------------------------------------

fn download_subtitles(url: &str, output_dir: &Path) -> i32 {
    if Command::new("yt-dlp").arg("--version").output().is_err() {
        eprintln!("Error: yt-dlp is not installed. Install it with: brew install yt-dlp");
        return 1;
    }

    if !output_dir.exists() {
        if let Err(e) = std::fs::create_dir_all(output_dir) {
            eprintln!("Error creating output directory: {e}");
            return 1;
        }
    }

    let before: std::collections::HashSet<_> = list_files(output_dir);

    let strategies: &[(&str, &str, bool)] = &[
        (
            "zh-Hans,zh-Hant,zh,zh-CN,zh-TW",
            "Manual Chinese subtitles",
            false,
        ),
        ("en,en-US,en-GB", "Manual English subtitles", false),
        (
            "zh-Hans,zh,en",
            "Auto-generated subtitles (zh/en)",
            true,
        ),
    ];

    for (langs, label, is_auto) in strategies {
        println!("Trying: {label}...");
        let mut cmd = Command::new("yt-dlp");
        cmd.arg("--skip-download")
            .arg("--sub-format")
            .arg("srt/vtt/best")
            .arg("-o")
            .arg(output_dir.join("%(title)s.%(ext)s").to_string_lossy().as_ref());

        if *is_auto {
            cmd.arg("--write-auto-sub")
                .arg("--sub-langs")
                .arg(langs);
        } else {
            cmd.arg("--write-sub").arg("--sub-langs").arg(langs);
        }
        cmd.arg(url);

        match cmd.output() {
            Ok(output) if output.status.success() => {
                let after: std::collections::HashSet<_> = list_files(output_dir);
                let new_files: Vec<_> = after.difference(&before).collect();
                if !new_files.is_empty() {
                    println!("Downloaded:");
                    for f in &new_files {
                        println!("  {}", f.display());
                    }
                    return 0;
                }
            }
            Ok(output) => {
                let stderr = String::from_utf8_lossy(&output.stderr);
                if !stderr.is_empty() {
                    eprintln!("  {stderr}");
                }
            }
            Err(e) => eprintln!("  Failed to run yt-dlp: {e}"),
        }
    }

    eprintln!("No subtitles found for this video.");
    1
}

fn list_files(dir: &Path) -> std::collections::HashSet<PathBuf> {
    std::fs::read_dir(dir)
        .map(|entries| {
            entries
                .filter_map(|e| e.ok())
                .filter(|e| e.file_type().map(|t| t.is_file()).unwrap_or(false))
                .map(|e| e.path())
                .collect()
        })
        .unwrap_or_default()
}

// ---------------------------------------------------------------------------
// Subcommand: clean-transcript
// ---------------------------------------------------------------------------

fn clean_transcript(input: &Path, output: Option<&Path>) -> i32 {
    let content = match std::fs::read_to_string(input) {
        Ok(c) => c,
        Err(e) => {
            eprintln!("Error reading {}: {e}", input.display());
            return 1;
        }
    };

    let is_vtt = input
        .extension()
        .map(|e| e == "vtt")
        .unwrap_or(false)
        || content.starts_with("WEBVTT");

    let re_timestamp =
        Regex::new(r"^\d{2}:\d{2}:\d{2}[.,]\d{3}\s*-->").unwrap();
    let re_seq_number = Regex::new(r"^\d+\s*$").unwrap();
    let re_html_tag = Regex::new(r"<[^>]+>").unwrap();
    let re_vtt_position = Regex::new(r"\b(?:align|position|size|line):[^\s]+").unwrap();
    let re_vtt_header = Regex::new(r"^(?:WEBVTT|Kind:|Language:)").unwrap();
    let re_note_block = Regex::new(r"^NOTE\b").unwrap();

    let mut lines: Vec<String> = Vec::new();
    let mut in_note_block = false;

    for line in content.lines() {
        let trimmed = line.trim();

        if trimmed.is_empty() {
            in_note_block = false;
            continue;
        }

        if is_vtt {
            if re_vtt_header.is_match(trimmed) {
                continue;
            }
            if re_note_block.is_match(trimmed) {
                in_note_block = true;
                continue;
            }
            if in_note_block {
                continue;
            }
        }

        if re_timestamp.is_match(trimmed) {
            continue;
        }

        if re_seq_number.is_match(trimmed) {
            continue;
        }

        let mut cleaned = re_html_tag.replace_all(trimmed, "").to_string();
        cleaned = re_vtt_position.replace_all(&cleaned, "").trim().to_string();

        if cleaned.is_empty() {
            continue;
        }

        if lines.last().map(|l| l.as_str()) == Some(&cleaned) {
            continue;
        }

        lines.push(cleaned);
    }

    let mut paragraphs: Vec<String> = Vec::new();
    let mut buffer = String::new();
    let sentence_end = Regex::new(r"[。！？.!?]\s*$").unwrap();

    for line in &lines {
        if !buffer.is_empty() {
            buffer.push(' ');
        }
        buffer.push_str(line);

        if buffer.chars().count() >= 200 || sentence_end.is_match(&buffer) {
            paragraphs.push(buffer.clone());
            buffer.clear();
        }
    }
    if !buffer.is_empty() {
        paragraphs.push(buffer);
    }

    let result = paragraphs.join("\n\n");

    let output_path = match output {
        Some(p) => p.to_path_buf(),
        None => {
            let stem = input.file_stem().unwrap_or_default().to_string_lossy();
            input.with_file_name(format!("{stem}_transcript.txt"))
        }
    };

    match std::fs::write(&output_path, &result) {
        Ok(_) => {
            println!(
                "Transcript written to {} ({} paragraphs, {} lines)",
                output_path.display(),
                paragraphs.len(),
                lines.len()
            );
            0
        }
        Err(e) => {
            eprintln!("Error writing output: {e}");
            1
        }
    }
}

// ---------------------------------------------------------------------------
// Subcommand: merge-research
// ---------------------------------------------------------------------------

const AGENTS: &[(&str, &str)] = &[
    ("01-writings", "著作"),
    ("02-conversations", "对话"),
    ("03-expression-dna", "表达"),
    ("04-external-views", "他者"),
    ("05-decisions", "决策"),
    ("06-timeline", "时间线"),
];

fn merge_research(skill_dir: &Path) -> i32 {
    let research_dir = skill_dir.join("references").join("research");
    if !research_dir.exists() {
        eprintln!("Error: directory not found: {}", research_dir.display());
        return 1;
    }

    let re_url = Regex::new(r"https?://[^\s)]+").unwrap();
    let re_primary =
        Regex::new(r"(?i)一手|primary|本人|原文|原始|直接引用").unwrap();
    let re_secondary =
        Regex::new(r"(?i)二手|secondary|转述|总结|分析").unwrap();
    let re_heading = Regex::new(r"^##\s+(.+)$").unwrap();
    let re_bold = Regex::new(r"\*\*(.+?)\*\*").unwrap();
    let re_contradiction =
        Regex::new(r"(?:矛盾|相反|但实际上|然而.*?不同|争议).{0,100}").unwrap();

    #[allow(dead_code)]
    struct AgentStats {
        label: String,
        url_count: usize,
        primary: usize,
        secondary: usize,
        findings: Vec<String>,
        found: bool,
    }

    let mut stats: Vec<AgentStats> = Vec::new();
    let mut contradictions: Vec<String> = Vec::new();
    let mut total_urls = 0usize;
    let mut total_primary = 0usize;
    let mut total_secondary = 0usize;
    let mut missing: Vec<String> = Vec::new();

    for (key, label) in AGENTS {
        let path = research_dir.join(format!("{key}.md"));
        if !path.exists() {
            missing.push(label.to_string());
            stats.push(AgentStats {
                label: label.to_string(),
                url_count: 0,
                primary: 0,
                secondary: 0,
                findings: vec![],
                found: false,
            });
            continue;
        }

        let content = match std::fs::read_to_string(&path) {
            Ok(c) => c,
            Err(_) => {
                missing.push(label.to_string());
                stats.push(AgentStats {
                    label: label.to_string(),
                    url_count: 0,
                    primary: 0,
                    secondary: 0,
                    findings: vec![],
                    found: false,
                });
                continue;
            }
        };

        let urls: std::collections::HashSet<_> =
            re_url.find_iter(&content).map(|m| m.as_str()).collect();
        let url_count = urls.len();

        let primary = re_primary.find_iter(&content).count();
        let secondary = re_secondary.find_iter(&content).count();

        let mut findings: Vec<String> = re_heading
            .captures_iter(&content)
            .take(3)
            .filter_map(|c| c.get(1).map(|m| m.as_str().to_string()))
            .collect();
        if findings.is_empty() {
            findings = re_bold
                .captures_iter(&content)
                .take(3)
                .filter_map(|c| c.get(1).map(|m| m.as_str().to_string()))
                .collect();
        }

        for m in re_contradiction.find_iter(&content) {
            let text = m.as_str();
            let truncated: String = text.chars().take(60).collect();
            contradictions.push(format!("{label}: {truncated}"));
        }

        total_urls += url_count;
        total_primary += primary;
        total_secondary += secondary;

        stats.push(AgentStats {
            label: label.to_string(),
            url_count,
            primary,
            secondary,
            findings,
            found: true,
        });
    }
    contradictions.truncate(5);

    let col1_width = 14;
    let col2_width = 10;
    let col3_width = 28;

    println!(
        "┌{}┬{}┬{}┐",
        "─".repeat(col1_width),
        "─".repeat(col2_width),
        "─".repeat(col3_width)
    );
    print_row("Agent", "来源数量", "关键发现", col1_width, col2_width, col3_width);
    println!(
        "├{}┼{}┼{}┤",
        "─".repeat(col1_width),
        "─".repeat(col2_width),
        "─".repeat(col3_width)
    );

    for s in &stats {
        if !s.found {
            let count_str = "❌ 缺失";
            print_row(
                &s.label,
                count_str,
                "—",
                col1_width,
                col2_width,
                col3_width,
            );
        } else {
            let count_str = format!("{}篇", s.url_count);
            let findings_str = if s.findings.is_empty() {
                "—".to_string()
            } else {
                let joined = s.findings.join(", ");
                truncate_display(&joined, col3_width - 4)
            };
            print_row(
                &s.label,
                &count_str,
                &findings_str,
                col1_width,
                col2_width,
                col3_width,
            );
        }
    }

    println!(
        "├{}┼{}┼{}┤",
        "─".repeat(col1_width),
        "─".repeat(col2_width),
        "─".repeat(col3_width)
    );

    let total_str = format!("{}", total_urls);
    let primary_ratio = if total_primary + total_secondary > 0 {
        format!(
            "一手占比: {}/{}",
            total_primary,
            total_primary + total_secondary
        )
    } else {
        "未标记".to_string()
    };
    print_row(
        "总来源数",
        &total_str,
        &primary_ratio,
        col1_width,
        col2_width,
        col3_width,
    );

    let contra_count = format!("{}处", contradictions.len());
    let contra_detail = contradictions.first().map_or("—".to_string(), |c| {
        truncate_display(c, col3_width - 4)
    });
    print_row(
        "矛盾点",
        &contra_count,
        &contra_detail,
        col1_width,
        col2_width,
        col3_width,
    );

    if !missing.is_empty() {
        let miss_count = format!("{}个", missing.len());
        let miss_labels = truncate_display(&missing.join(", "), col3_width - 4);
        print_row(
            "信息不足维度",
            &miss_count,
            &miss_labels,
            col1_width,
            col2_width,
            col3_width,
        );
    } else {
        print_row(
            "信息不足维度",
            "无",
            "—",
            col1_width,
            col2_width,
            col3_width,
        );
    }

    println!(
        "└{}┴{}┴{}┘",
        "─".repeat(col1_width),
        "─".repeat(col2_width),
        "─".repeat(col3_width)
    );

    if total_urls < 10 {
        println!("\n⚠️  总来源数 <10，建议降低期望或补充调研");
    }
    if !missing.is_empty() {
        println!(
            "\n⚠️  缺失维度: {}，建议补充或在诚实边界中标注",
            missing.join(", ")
        );
    }

    0
}

/// Print a table row with CJK-aware column alignment
fn print_row(
    col1: &str,
    col2: &str,
    col3: &str,
    w1: usize,
    w2: usize,
    w3: usize,
) {
    let pad1 = pad_to_width(col1, w1 - 2);
    let pad2 = pad_to_width(col2, w2 - 2);
    let pad3 = pad_to_width(col3, w3 - 2);
    println!("│ {pad1} │ {pad2} │ {pad3} │");
}

/// Pad a string with spaces to reach target display width, accounting for CJK chars
fn pad_to_width(s: &str, target: usize) -> String {
    let display_w = UnicodeWidthStr::width(s);
    if display_w >= target {
        s.to_string()
    } else {
        format!("{}{}", s, " ".repeat(target - display_w))
    }
}

/// Truncate a string to fit within a target display width
fn truncate_display(s: &str, max_width: usize) -> String {
    let mut width = 0;
    let mut result = String::new();
    for ch in s.chars() {
        let ch_width = unicode_width::UnicodeWidthChar::width(ch).unwrap_or(0);
        if width + ch_width + 3 > max_width {
            result.push_str("...");
            return result;
        }
        width += ch_width;
        result.push(ch);
    }
    result
}

// ---------------------------------------------------------------------------
// Subcommand: quality-check
// ---------------------------------------------------------------------------

fn quality_check(path: &Path) -> i32 {
    let content = match std::fs::read_to_string(path) {
        Ok(c) => c,
        Err(e) => {
            eprintln!("Error reading {}: {e}", path.display());
            return 1;
        }
    };

    let sections = parse_sections(&content);

    println!(
        "质量检查: {}",
        path.file_name().unwrap_or_default().to_string_lossy()
    );
    println!("{}", "=".repeat(60));

    let checks: Vec<(&str, bool, String)> = vec![
        {
            let (pass, detail) = check_mental_models(&sections);
            ("心智模型数量", pass, detail)
        },
        {
            let (pass, detail) = check_limitations_per_model(&sections);
            ("模型局限性", pass, detail)
        },
        {
            let (pass, detail) = check_expression_dna(&sections);
            ("表达DNA辨识度", pass, detail)
        },
        {
            let (pass, detail) = check_honest_boundary(&sections);
            ("诚实边界", pass, detail)
        },
        {
            let (pass, detail) = check_tensions(&sections);
            ("内在张力", pass, detail)
        },
        {
            let (pass, detail) = check_primary_sources(&sections);
            ("一手来源占比", pass, detail)
        },
        {
            let (pass, detail) = check_agentic_protocol(&sections);
            ("Agentic Protocol", pass, detail)
        },
        {
            let (pass, detail) = check_changelog(&sections);
            ("更新日志", pass, detail)
        },
    ];

    let mut passed_count = 0;
    let total = checks.len();

    for (name, passed, detail) in &checks {
        let status = if *passed { "✅ PASS" } else { "❌ FAIL" };
        let padded_name = pad_to_width(name, 20);
        println!("  {padded_name} {status}  {detail}");
        if *passed {
            passed_count += 1;
        }
    }

    println!("{}", "=".repeat(60));
    println!("结果: {passed_count}/{total} 通过");

    if passed_count == total {
        println!("🎉 全部通过，可以交付");
    } else if passed_count >= total - 2 {
        println!("⚠️  基本通过，建议修复不通过项后交付");
    } else {
        println!("❌ 多项不通过，建议回到Phase 2迭代");
    }

    if passed_count == total {
        0
    } else {
        1
    }
}

/// Parse markdown content into sections by ## headers
fn parse_sections(content: &str) -> HashMap<String, String> {
    let re = Regex::new(r"(?m)^##\s+(.+)$").unwrap();
    let mut sections = HashMap::new();
    let mut current_name: Option<String> = None;
    let mut current_content = String::new();

    for line in content.lines() {
        if let Some(caps) = re.captures(line) {
            if let Some(name) = current_name.take() {
                sections.insert(name, current_content.clone());
            }
            current_name = Some(caps[1].to_string());
            current_content.clear();
        } else if current_name.is_some() {
            current_content.push_str(line);
            current_content.push('\n');
        }
    }
    if let Some(name) = current_name {
        sections.insert(name, current_content);
    }

    sections
}

/// Find a section whose name contains any of the given keywords
fn find_section<'a>(
    sections: &'a HashMap<String, String>,
    keywords: &[&str],
) -> Option<(&'a str, &'a str)> {
    for (name, content) in sections {
        let name_lower = name.to_lowercase();
        for kw in keywords {
            if name_lower.contains(&kw.to_lowercase()) {
                return Some((name.as_str(), content.as_str()));
            }
        }
    }
    None
}

/// Count ### subheadings within a section's content
fn count_subheadings(section_content: &str) -> usize {
    let re = Regex::new(r"(?m)^###\s+").unwrap();
    re.find_iter(section_content).count()
}

fn check_mental_models(sections: &HashMap<String, String>) -> (bool, String) {
    match find_section(sections, &["心智模型", "Mental Model"]) {
        Some((_, content)) => {
            let count = count_subheadings(content);
            let pass = (3..=7).contains(&count);
            (
                pass,
                format!(
                    "{count}个心智模型 {}",
                    if pass { "✅" } else { "❌ (应为3-7个)" }
                ),
            )
        }
        None => (false, "未找到心智模型section".to_string()),
    }
}

fn check_limitations_per_model(sections: &HashMap<String, String>) -> (bool, String) {
    let re_sub = Regex::new(r"(?m)^###\s+(.+)$").unwrap();
    let re_limit = Regex::new(r"(?i)局限|失效|不适用|盲区|limitation|blind spot").unwrap();

    match find_section(sections, &["心智模型", "Mental Model"]) {
        Some((_, content)) => {
            let lines: Vec<&str> = content.lines().collect();
            let mut models: Vec<(String, bool)> = Vec::new();
            let mut current_model: Option<String> = None;
            let mut current_text = String::new();

            for line in &lines {
                if let Some(caps) = re_sub.captures(line) {
                    if let Some(name) = current_model.take() {
                        let has_limit = re_limit.is_match(&current_text);
                        models.push((name, has_limit));
                    }
                    current_model = Some(caps[1].to_string());
                    current_text.clear();
                } else if current_model.is_some() {
                    current_text.push_str(line);
                    current_text.push('\n');
                }
            }
            if let Some(name) = current_model {
                let has_limit = re_limit.is_match(&current_text);
                models.push((name, has_limit));
            }

            if models.is_empty() {
                return (false, "未找到心智模型子section".to_string());
            }

            let missing: Vec<&str> = models
                .iter()
                .filter(|(_, has)| !has)
                .map(|(name, _)| name.as_str())
                .collect();

            if missing.is_empty() {
                (true, format!("全部{}个模型都有局限性标注 ✅", models.len()))
            } else {
                (
                    false,
                    format!(
                        "❌ 以下模型缺少局限性: {}",
                        missing.join(", ")
                    ),
                )
            }
        }
        None => (false, "未找到心智模型section".to_string()),
    }
}

fn check_expression_dna(sections: &HashMap<String, String>) -> (bool, String) {
    match find_section(sections, &["表达DNA", "Expression DNA", "表达风格"]) {
        Some((_, content)) => {
            let markers = [
                "句式", "词汇", "语气", "幽默", "节奏", "确定性", "引用", "口头禅",
            ];
            let count = markers.iter().filter(|m| content.contains(*m)).count();
            let pass = count >= 3;
            (
                pass,
                format!(
                    "表达DNA特征: {count}项 {}",
                    if pass { "✅" } else { "❌ (应≥3项)" }
                ),
            )
        }
        None => (false, "❌ 未找到表达DNA section".to_string()),
    }
}

fn check_honest_boundary(sections: &HashMap<String, String>) -> (bool, String) {
    match find_section(sections, &["诚实边界", "Honest Boundary"]) {
        Some((_, content)) => {
            let re_list = Regex::new(r"(?m)^[-*]\s+").unwrap();
            let count = re_list.find_iter(content).count();
            let pass = count >= 3;
            (
                pass,
                format!(
                    "诚实边界: {count}条 {}",
                    if pass { "✅" } else { "❌ (应≥3条)" }
                ),
            )
        }
        None => (false, "❌ 未找到诚实边界section".to_string()),
    }
}

fn check_tensions(sections: &HashMap<String, String>) -> (bool, String) {
    let target_sections = [
        "价值观",
        "反模式",
        "价值观与反模式",
        "Values",
        "内在张力",
    ];

    let re_tension = Regex::new(r"(?i)张力|矛盾|tension|paradox|一方面.*另一方面|既.*又").unwrap();

    let mut total = 0;
    for kw in &target_sections {
        if let Some((_, content)) = find_section(sections, &[kw]) {
            total += re_tension.find_iter(content).count();
        }
    }

    let re_unclear =
        Regex::new(r"没想清楚|内在冲突|自我矛盾").unwrap();
    for (_, content) in sections {
        total += re_unclear.find_iter(content).count();
    }

    let pass = total >= 2;
    (
        pass,
        format!(
            "内在张力: {total}处 {}",
            if pass { "✅" } else { "❌ (应≥2处)" }
        ),
    )
}

fn check_primary_sources(sections: &HashMap<String, String>) -> (bool, String) {
    let source_section = find_section(sections, &["来源", "Source", "Reference", "调研来源"]);

    match source_section {
        Some((_, content)) => {
            let re_primary_header =
                Regex::new(r"(?i)###.*一手|###.*primary").unwrap();
            let re_secondary_header =
                Regex::new(r"(?i)###.*二手|###.*secondary").unwrap();
            let re_list_item = Regex::new(r"(?m)^[-*]\s+").unwrap();

            let mut primary_count = 0;
            let mut secondary_count = 0;
            let mut current_type: Option<&str> = None;

            for line in content.lines() {
                if re_primary_header.is_match(line) {
                    current_type = Some("primary");
                } else if re_secondary_header.is_match(line) {
                    current_type = Some("secondary");
                } else if line.starts_with("### ") {
                    current_type = None;
                } else if re_list_item.is_match(line) {
                    match current_type {
                        Some("primary") => primary_count += 1,
                        Some("secondary") => secondary_count += 1,
                        _ => {}
                    }
                }
            }

            let total = primary_count + secondary_count;
            if total == 0 {
                return (true, "未标记来源类型（跳过检查）".to_string());
            }

            let ratio = primary_count as f64 / total as f64;
            let pass = ratio > 0.5;
            (
                pass,
                format!(
                    "一手来源占比: {primary_count}/{total} ({:.0}%) {}",
                    ratio * 100.0,
                    if pass { "✅" } else { "❌ (应>50%)" }
                ),
            )
        }
        None => (true, "未找到来源section（跳过检查）".to_string()),
    }
}

fn check_agentic_protocol(sections: &HashMap<String, String>) -> (bool, String) {
    match find_section(
        sections,
        &["回答工作流", "Agentic Protocol", "Answer Workflow"],
    ) {
        Some((_, content)) => {
            let has_step1 = content.contains("Step 1") || content.contains("问题分类");
            let has_step2 = content.contains("Step 2") || content.contains("研究");
            let has_step3 = content.contains("Step 3") || content.contains("回答");

            let steps_present = [has_step1, has_step2, has_step3]
                .iter()
                .filter(|&&v| v)
                .count();

            let pass = steps_present == 3;
            (
                pass,
                format!(
                    "Agentic Protocol: {steps_present}/3 steps {}",
                    if pass { "✅" } else { "❌ (需要3个step)" }
                ),
            )
        }
        None => (false, "❌ 未找到Agentic Protocol section".to_string()),
    }
}

fn check_changelog(sections: &HashMap<String, String>) -> (bool, String) {
    match find_section(sections, &["更新日志", "Changelog", "版本历史"]) {
        Some((_, content)) => {
            let has_table = content.contains('|') && content.contains("版本") || content.contains("Version");
            (
                has_table,
                if has_table {
                    "更新日志表格存在 ✅".to_string()
                } else {
                    "❌ 更新日志section存在但格式不对".to_string()
                },
            )
        }
        None => (false, "❌ 未找到更新日志section（建议添加）".to_string()),
    }
}
