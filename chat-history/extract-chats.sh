#!/bin/bash
# Extract Claude Code session history to .chats directory
# Usage: ./extract-chats.sh [date-pattern] [output-dir]
# Example: ./extract-chats.sh "Dec 25" .chats

set -e

DATE_PATTERN="${1:-}"
OUTPUT_DIR="${2:-.chats}"

# Get encoded project path from current directory
PROJECT_PATH=$(pwd | sed 's|/|-|g' | sed 's|^|/|' | sed 's|^/|-|')
SESSION_DIR="$HOME/.claude/projects/$PROJECT_PATH"

if [ ! -d "$SESSION_DIR" ]; then
    echo "Error: No session directory found at $SESSION_DIR"
    exit 1
fi

echo "Session directory: $SESSION_DIR"
mkdir -p "$OUTPUT_DIR"

# Function to extract user inputs from a session file
extract_inputs() {
    local file="$1"
    jq -r '
      select(.type == "user" and .userType == "external" and (.isMeta | not)) |
      .message.content |
      if type == "string" then . else empty end
    ' "$file" 2>/dev/null | \
    grep -v "^Caveat:" | \
    grep -v "^<command" | \
    grep -v "^<local-command" | \
    grep -v "^This session is being continued" | \
    grep -v "^<user-prompt-submit-hook>" | \
    grep -v "^Analysis:" | \
    grep -v "^⏺" | \
    grep -v "^            <command" | \
    grep -v "^$" || true
}

# Get unique dates from session files
if [ -n "$DATE_PATTERN" ]; then
    DATES=$(ls -la "$SESSION_DIR"/*.jsonl 2>/dev/null | grep -v agent- | grep "$DATE_PATTERN" | awk '{print $6" "$7}' | sort -u)
else
    DATES=$(ls -la "$SESSION_DIR"/*.jsonl 2>/dev/null | grep -v agent- | awk '{print $6" "$7}' | sort -u)
fi

if [ -z "$DATES" ]; then
    echo "No sessions found${DATE_PATTERN:+ matching '$DATE_PATTERN'}"
    exit 0
fi

echo "Found sessions for dates:"
echo "$DATES"
echo ""

# Process each date
echo "$DATES" | while read -r month day; do
    # Skip if empty
    [ -z "$month" ] && continue

    # Convert month name to number
    case "$month" in
        Jan) month_num="01" ;;
        Feb) month_num="02" ;;
        Mar) month_num="03" ;;
        Apr) month_num="04" ;;
        May) month_num="05" ;;
        Jun) month_num="06" ;;
        Jul) month_num="07" ;;
        Aug) month_num="08" ;;
        Sep) month_num="09" ;;
        Oct) month_num="10" ;;
        Nov) month_num="11" ;;
        Dec) month_num="12" ;;
        *) continue ;;
    esac

    # Pad day with zero if needed
    day_padded=$(printf "%02d" "$day")

    # Get year from file stat (assume current year for recent dates)
    year=$(date +%Y)

    # Output filename
    output_file="$OUTPUT_DIR/${year}${month_num}${day_padded}.md"

    echo "Processing $month $day -> $output_file"

    # Find all sessions for this date
    sessions=$(ls -la "$SESSION_DIR"/*.jsonl 2>/dev/null | grep -v agent- | grep "$month" | grep " $day " | awk '{print $NF}')

    if [ -z "$sessions" ]; then
        continue
    fi

    # Start building the output
    {
        echo "# Instructions"
        echo ""

        for session in $sessions; do
            inputs=$(extract_inputs "$session")
            if [ -n "$inputs" ]; then
                echo "## Session $(basename "$session" .jsonl)"
                echo ""
                echo "$inputs" | head -10  # Limit to first 10 inputs per session
                echo ""
            fi
        done
    } > "$output_file.tmp"

    # Only write if we have content beyond the header
    if [ "$(wc -l < "$output_file.tmp")" -gt 3 ]; then
        mv "$output_file.tmp" "$output_file"
        echo "  Created: $output_file"
    else
        rm -f "$output_file.tmp"
        echo "  Skipped: No meaningful inputs found"
    fi
done

echo ""
echo "Done! Files created in $OUTPUT_DIR/"
ls -la "$OUTPUT_DIR"/*.md 2>/dev/null || echo "No files created"
