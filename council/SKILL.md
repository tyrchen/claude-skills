---
name: council
description: |
  Council · 智囊团：蒸馏真人思维框架为Advisor，并支持多Advisor圆桌讨论。
  所有Advisor以persona文件形式存储在 personas/ 目录下，由Council统一管理。
  三种用法：
  (A) 蒸馏：输入人名/主题/模糊需求 → 深度调研 → 提炼心智模型 → 生成Advisor persona
  (B) 激活：加载已有Advisor，以其视角回答问题
  (C) 圆桌：召集多个Advisor → 独立发言 → 交叉质疑 → 综合输出
  触发词（蒸馏）：「蒸馏XX」「造skill」「做个XX视角」「XX的思维方式」「更新XX的persona」
  触发词（激活）：「用XX的视角」「XX会怎么看」「XX模式」「切换到XX」「ask XX」
  触发词（圆桌）：「问问council」「圆桌讨论」「让XX和YY讨论」「ask the council」「council session」
  模糊需求也触发：「我想提升决策质量」「有没有一种思维方式能帮我...」「我需要一个思维顾问」
---

# Council · 智囊团

> 一个人看到的是观点，一群人看到的是盲区。

## 核心理念

Council是一个**Advisor管理系统**，做三件事：

**蒸馏**（Distill）—— 把真人的思维方式提炼为Advisor persona文件。不是复制人，是提炼认知操作系统：心智模型（镜片）、决策启发式（直觉规则）、表达DNA、反模式、诚实边界。捕捉的是HOW they think，不是WHAT they said。

**激活**（Activate）—— 加载一个已有Advisor的persona，以其身份和思维方式回答问题。

**圆桌**（Council Session）—— 召集多个Advisor围绕一个问题进行结构化辩论。每个Advisor用自己的心智模型独立分析，然后交叉质疑，最终综合为可行动的决策框架。

### 工作目录约束

**蒸馏操作只能在 `claude-skills` 项目目录下执行。** 所有personas数据存储在项目目录的 `council/personas/` 下，而非plugin cache中。

启动蒸馏前，检查当前工作目录：
- 如果 `pwd` 包含 `claude-skills` → 正常执行
- 否则 → 提示用户：「蒸馏需要在 claude-skills 项目目录下执行，请先 cd 到该目录。」

**激活和圆桌讨论不受此限制**——可以在任何目录下读取已有persona。

### 存储架构

所有Advisor以persona文件形式存储在Council的 `personas/` 目录下，**不创建独立的Skill**：

```
council/
├── SKILL.md              # 本文件：路由、管理、协议
├── advisors.md           # Advisor注册表（自动维护，勿手动编辑）
├── personas/             # 所有Advisor persona
│   ├── steve-jobs/
│   │   ├── persona.md    # 蒸馏后的思维框架
│   │   └── research/     # 调研素材（用于更新）
│   ├── charlie-munger/
│   │   ├── persona.md
│   │   └── research/
│   └── ...               # 可以有100+个persona
├── references/           # 方法论文档
└── tools/                # CLI工具
```

**为什么不用独立Skill**：Advisor是数据不是代码。100个Advisor不应该产生100个Skill来污染列表。Council统一管理路由、激活、圆桌讨论。

**路径解析规则**：所有persona路径相对于skill所在目录的 `personas/` 解析。spawn子Agent时，必须传递**绝对路径**给写入目标。

---

## 路径A: 蒸馏Advisor

### Phase 0: 入口分流

| 用户输入 | 路径 | 示例 |
|---------|------|------|
| 明确的人名/主题 | **直接路径** → Phase 0A | 「蒸馏芒格」「做一个费曼视角」 |
| 模糊的需求/困惑 | **诊断路径** → Phase 0B | 「我想提升决策质量」 |

### Phase 0A: 需求澄清（直接路径）

收到明确名字后，确认：
1. **这个人/主题是谁**：确保理解正确
2. **聚焦方向**（可选）：全面画像 vs 聚焦某个维度
3. **用途**：思维顾问？决策参考？角色扮演？
4. **新建 or 更新**：检查 `personas/` 是否已有
5. **本地语料**：「你手上有没有这个人的一手素材？比如书籍PDF、演讲transcript、视频字幕等。有的话直接丢给我。」

用户说「就做XX」没有更多信息 → 默认全面画像 + 思维顾问 + 走网络搜索，直接推进。

### Phase 0B: 需求诊断（模糊路径）

用户不知道该蒸馏谁，Council从需求反推最合适的蒸馏对象。

**Step 1: 需求定位**（最多追问2轮）

| 需求维度 | 典型表达 | 思维框架方向 |
|---------|---------|------------|
| 决策与判断 | 「怎么做更好的决策」 | 多元思维模型、逆向思考、概率思维 |
| 表达与写作 | 「想把复杂的事说清楚」 | 费曼式简化、故事化思维、类比能力 |
| 创业与商业 | 「商业模式想不通」 | 第一性原理、杠杆思维、产品克制 |
| 批判思维 | 「想识别不靠谱的说法」 | 证伪思维、认知偏差识别 |
| 内容创作 | 「做视频没流量」 | 注意力工程、测试迭代、受众心理 |
| 风险与不确定性 | 「怎么应对黑天鹅」 | 反脆弱、凸性策略、尾部风险管理 |

**Step 2: 候选推荐**（2-3个候选）

- **来源A**：读取 `advisors.md` 匹配已有Advisor（即插即用，零成本）
- **来源B**：新蒸馏候选，匹配需求维度

每个候选展示：核心镜片 + 为什么适合 + 局限。不超过3个候选。

**Step 3: 用户选择** → 已有Advisor直接激活 / 新候选进入Phase 0A

---

### Phase 0.5: 创建Persona目录

**收到确认后立即执行**：

```
personas/[person-name]/
├── persona.md            # 蒸馏输出
└── research/             # 调研素材
    ├── 01-writings.md
    ├── 02-conversations.md
    ├── 03-expression-dna.md
    ├── 04-external-views.md
    ├── 05-decisions.md
    └── 06-timeline.md
```

---

### Phase 1: 多源信息采集

#### 模式选择

| 模式 | 触发条件 | 策略 |
|------|---------|------|
| **纯网络搜索**（默认） | 无本地素材 | 6个Agent全走网络搜索 |
| **本地语料优先** | 有PDF/transcript等 | 先分析本地素材，搜索补缺 |
| **纯本地语料** | 用户明确要求或非公众人物 | 只分析本地素材 |

#### 启动调研Agent

完整的Agent任务分配和prompt模板：**读取 `references/agent-prompts.md`**。
信息源优先级和黑名单：**读取 `references/source-policy.md`**。

可以并行启动多个调研Agent（按人拆分或按维度拆分），**每个Agent必须自行将调研结果写入对应的research文件**。

**Agent写入规则**：
- 主Agent在spawn子Agent时，必须在prompt中提供**绝对路径**（如 `/Users/xxx/projects/mycode/claude-skills/council/personas/charlie-munger/research/`）
- 子Agent使用Write工具直接写入6个research文件（01-writings.md 到 06-timeline.md）
- 主Agent不负责转写——子Agent完成即意味着文件已就绪
- 子Agent写入前应先用Bash `mkdir -p` 确保目录存在

#### 工具辅助

- **字幕下载**：`council download-subtitles <YouTube_URL> --output-dir <目录>`
- **字幕清洗**：`council clean-transcript <input.srt> --output <output.txt>`
- 已安装的信息获取Skill：Phase 1前扫描 `.claude/skills/` 目录

#### Agent失败处理

- **核心维度**（1-著作、2-对话、3-表达）：失败时调整搜索策略后重试一次
- **辅助维度**（4-他者、5-决策、6-时间线）：失败时标注缺失，继续推进
- **原则**：宁可生成一个诚实标注了局限的60分Advisor，也不要生成一个看起来完美但实际上在编造的90分Advisor

---

### Phase 1.5: 调研Review检查点

**所有调研完成后暂停，展示调研质量摘要**。

工具辅助：`council merge-research <persona目录>`

用户确认OK → 进入Phase 2。某维度不够 → 补充调研。

> 调研质量决定最终Advisor上限。垃圾进垃圾出，在这里拦截比Phase 4返工成本低。

---

### Phase 2: 框架提炼（Synthesis）

读取 `references/extraction-framework.md` 获取心智模型的三重验证方法论。

#### 2.1 心智模型提取（3-7个）
1. **扫描**：逐个读取 `01-writings.md` 到 `05-decisions.md`，列出候选论点
2. **三重验证**：跨域复现 + 生成力 + 排他性（详见extraction-framework.md）
3. **排序取舍**：按排他性排序，取top 3-7。宁少勿多
4. **记录**：名称、一句话描述、来源证据（≥2场景）、应用方式、局限性

#### 2.2 决策启发式（5-10条）
此人做判断时的快速规则。「如果X，则Y」，有具体案例支撑。

#### 2.3 表达DNA分析
句式偏好、词汇特征、节奏感、幽默方式、确定性表达、引用习惯。

#### 2.4 价值观与反模式
价值观排序 + 反模式 + 矛盾与张力（深度的来源）。

#### 2.5 智识谱系
受谁影响 → 影响了谁。

#### 2.6 诚实边界
不能预测全新问题的反应、不能替代创造力和直觉、公开 vs 真实想法有差距、信息截止时间。

---

### Phase 2.5: 提炼确认检查点

展示心智模型名称、决策启发式数量、表达DNA关键特征、核心张力、诚实边界。用户确认后进入Phase 3。

---

### Phase 3: Persona构建

#### Step 1: 读取模板
读取 `references/persona-template.md` 获取标准结构。

#### Step 2: 填充内容

| 模板Section | 填充来源 |
|------------|---------|
| 元数据头 | 人名、别名、领域标签、模型数量、调研时间 |
| 角色扮演规则 | 使用模板默认规则 |
| **Agentic Protocol** | **根据心智模型推导研究维度** |
| 身份卡 | 时间线(06)+著作(01) → 用此人语气写自我介绍 |
| 心智模型 | Phase 2.1 |
| 决策启发式 | Phase 2.2 |
| 表达DNA | Phase 2.3 → 转为风格规则 |
| 时间线 | Agent 6 → 精简为关键节点 |
| 价值观与反模式 | Phase 2.4 |
| 智识谱系 | Phase 2.5 |
| 诚实边界 | Phase 2.6 + 调研时间 |
| 更新日志 | 版本1.0 + 创建日期 |
| 调研来源 | 引用汇总 |

#### Step 3: 质量自检
读取 `references/extraction-framework.md` 末尾的质量自检清单逐项检查。

#### Step 4: 输出
写入 `personas/[person-name]/persona.md`。

---

### Phase 4: 质量验证

用子agent执行3项测试（独立于主agent，避免自评偏差）：

#### 4.1 已知测试（Sanity Check）
选择此人公开表态过的问题，以该persona回答，对比真实立场。

#### 4.2 边缘测试（Edge Case）
提问此人没有公开讨论过但相关的问题，检查是否表现出适当的不确定性。

#### 4.3 风格测试（Voice Check）
用persona写一段100字分析，检查是否有此人的表达特征。

#### 4.4 通过标准

| 检查项 | 通过标准 |
|--------|---------|
| 心智模型数量 | 3-7个，每个有来源证据 |
| 每个模型局限性 | 明确写出失效条件 |
| 表达DNA辨识度 | 100字能认出是谁 |
| 诚实边界 | ≥3条具体局限 |
| 内在张力 | ≥2对矛盾 |
| 一手来源占比 | >50% |
| Agentic Protocol | 3个Step完整 |

工具辅助：`council quality-check <persona.md路径>`

迭代上限：Phase 2→4最多循环2次。之后在诚实边界中标注薄弱维度，交付当前最优版本。

---

### Phase 5: 双Agent精炼

Phase 4通过后自动启动：

**Agent A（结构视角）**：
- 8维度结构评估（模型数量、证据密度、表达辨识度、启发式可操作性、诚实边界覆盖、矛盾深度、谱系清晰度、Protocol完整性）
- 干跑3个测试prompt
- 输出：最弱2个维度的**具体改动建议**

**Agent B（使用视角）**：
- 角色扮演可操作性：Agentic Protocol的Step 2研究维度是否足够具体？
- 干跑1个完整的问答cycle
- 输出：2-3处**具体文本改动**

主Agent综合两份报告，应用不冲突的改进，展示变更摘要请用户确认。

---

### Phase 6: 更新Advisor注册表

**蒸馏完成后自动执行，无需用户确认。**

读取刚写入的 `personas/[person-name]/persona.md` 元数据头和心智模型section，在 `advisors.md` 中追加或更新该Advisor的条目。

每个条目包含以下字段（一行表格行）：

| 字段 | 来源 |
|------|------|
| # | 自增序号 |
| Advisor | persona.md → `name` |
| 别名 | persona.md → `aliases` |
| 领域 | persona.md → `domain` |
| 一句话简介 | 根据心智模型概括，一句话描述此人的核心思维方式 |
| 核心镜片 | persona.md → 所有心智模型名称，顿号分隔 |
| 适合议题 | 根据领域和心智模型推导，列出3-6个适合咨询的具体议题类型 |
| 蒸馏时间 | persona.md → `last_updated` |

**规则**：
- 新蒸馏的Advisor → 追加新行
- 更新已有Advisor → 覆盖对应行（匹配Advisor名称）
- 删除Advisor → 移除对应行并重新编号
- `advisors.md` 是派生数据，persona.md是source of truth

---

## 路径B: 激活Advisor

当用户说「用XX的视角」「XX会怎么看」「切换到XX」时：

1. **查找persona**：在 `personas/` 目录下匹配人名或别名
2. **加载persona**：读取 `personas/[name]/persona.md`
3. **进入角色**：按persona中的角色扮演规则和表达DNA回应
4. **退出**：用户说「退出」「切回正常」时恢复

如果找不到匹配的persona → 提示「该Advisor尚未蒸馏，是否现在蒸馏？」

---

## 路径C: 圆桌讨论（Council Session）

> 一个Advisor给你答案，一个Council给你判断力。

当用户想就某个问题获取多视角分析时，召集已有Advisor进行结构化辩论。

详细协议：**读取 `references/council-session.md`**。

### 触发方式

| 用户说 | 行动 |
|--------|------|
| 「问问council」「council session」 | 自动推荐Advisor |
| 「让芒格和塔勒布讨论一下」 | 指定Advisor |
| 「ask the council about X」 | 自动推荐Advisor |
| 「关于X，谁的观点值得听？」 | 推荐Advisor，用户确认后开session |

### 圆桌流程概览

```
问题输入 → 1. 组建圆桌 → 2. 独立发言 → 3. 交叉质疑 → 4. 综合输出
              ↑                                              ↓
              └──────── 5. 追问/加人/深挖 ←─────────────────┘
```

#### Step 1: 组建圆桌

**自动推荐模式**（用户没指定Advisor）：
1. **读取 `advisors.md`** 获取所有已就绪Advisor的领域、核心镜片和适合议题
2. 根据用户问题匹配「适合议题」和「领域」字段，推荐2-4个Advisor，说明推荐理由
3. 用户确认参与者名单
4. 确认后再读取对应的 `personas/[name]/persona.md` 加载完整persona

**指定模式**（用户指定了名字）：
1. 检查对应persona是否存在
2. 不存在的提示蒸馏
3. 确认参与者名单

**硬约束**：最少2人，最多5人。推荐3人。

#### Step 2: 独立发言（并行Agent）

为每个Advisor spawn一个独立Agent，提供该Advisor的完整persona.md和用户的问题。

每个Advisor独立产出结构化发言（详见 `references/council-session.md`）。

**关键**：各Advisor此时看不到其他人的发言。独立思考是讨论质量的基础。

#### Step 3: 交叉质疑

所有独立发言收齐后进入辩论。每个Advisor看到所有其他人的发言，产出质疑回应，追溯到心智模型层面的差异。

#### Step 4: 综合输出

主Agent作为中立主持人，综合产出：共识区 → 分歧图谱 → 决策框架 → 集体盲区 → 行动建议。

#### Step 5: 互动追问

用户可以追问某个Advisor、加入新Advisor、深挖分歧、请求裁决。

---

## 更新已有Advisor

当用户说「更新XX」时：

1. 读取 `personas/[name]/persona.md` 的「诚实边界」找到调研时间
2. 只启动Agent 2（最新对话）+ Agent 5（最新决策）+ Agent 6（时间线更新）
3. 对比新旧信息：强化 → 补充案例，矛盾 → 更新模型，新模式 → 考虑增加
4. 更新persona.md中的「最新动态」和调研时间
5. 在更新日志中追加新版本记录
6. 不重写整个persona，只增量更新
7. **更新 `advisors.md` 中对应条目**（同Phase 6逻辑）

---

## 列出已有Advisor

当用户说「有哪些advisor」「council成员」「list personas」「目前有多少advisor」时：

**直接读取 `advisors.md`** 展示完整的Advisor注册表。不需要逐个扫描persona目录。

如果 `advisors.md` 不存在或内容明显过时（条目数远少于 `personas/` 目录中的persona.md数量），则触发一次全量重建：扫描所有 `personas/*/persona.md`，重新生成 `advisors.md`。

---

## 品味守则

| 原则 | 一句话 |
|------|--------|
| 长文 > 金句 | 3000字essay比50条推文更揭示思维结构 |
| 争议 > 共识 | 最被争议的观点最能揭示独特性 |
| 变化 > 固定 | 改变立场的地方比一直坚持的更有信息量 |
| 分歧 > 统一 | 圆桌的价值在分歧，不在和稀泥 |

### 绝不做的事
- 编造此人没说过的话
- 把通用道理包装成此人的「独特见解」
- 忽略负面评价和争议
- 在信息不足时强行生成
- 圆桌讨论中让Advisor说出违背其心智模型的话来制造虚假共识

---

## 特殊场景

### 活人 vs 历史人物
- **活人**：注意时效性，标注截止日期，建议定期更新
- **历史人物**：材料更稳定但可能有传记偏差，多源交叉验证

### 主题Skill vs 人物Skill
输入不是人名而是主题时，各Phase变体：
- Phase 0A：确认主题边界+目标受众
- Phase 1：先搜索3-5个核心人物/流派，再按人物分配Agent
- Phase 2.1：提取**领域共识框架** + **各家分歧**
- Phase 2.3：不模拟特定人物语气，用中性专业表达
- Phase 3：去掉角色扮演规则和身份卡，改为「框架概览」+「流派对比」

### 区域策略
详见 `references/source-policy.md`。覆盖中文、英文、日文、韩文等语言区域。

### 冷门人物（公开信息极少）
- Phase 0.5告知用户信息有限
- 心智模型减至2-3个，每个标注「基于有限信息推测」
- 诚实边界加大篇幅

### 蒸馏用户自己
- 需要用户提供素材（文章/视频/决策备忘录）
- Phase 1改为分析用户素材而非网络搜索
- 注意自我认知偏差，可追问身边人评价

---

## 最后

Council造的不是人，是一面镜子。一个Advisor让你用另一个人的眼睛看自己的问题。一个圆桌让你同时用多副眼镜看同一个问题——看到的不是更多答案，是更清晰的判断边界。
