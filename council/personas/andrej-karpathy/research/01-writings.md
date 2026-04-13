# 著作与系统思考

## 经典博客文章

### "The Unreasonable Effectiveness of Recurrent Neural Networks" (2015年5月21日)
- **来源**: [karpathy.github.io](http://karpathy.github.io/2015/05/21/rnn-effectiveness/) (一手)
- 展示了字符级RNN语言模型如何学会写诗歌、LaTeX数学公式和代码
- 发布后迅速走红，成为深度学习领域最经典的博客之一
- 首次向大众展示了RNN的惊人能力，附带可运行代码

### "Software 2.0" (2017年11月11日，Medium)
- **来源**: [karpathy.medium.com](https://karpathy.medium.com/software-2-0-a64152b37c35) (一手)
- 核心论点：神经网络代表了软件开发的范式转变
- Software 1.0（经典栈）= 用Python/C++等编写的显式指令
- Software 2.0 = 用神经网络权重编写的"抽象、人类不友好的语言"
- 原创性洞察："Software 1.0轻松自动化你能**指定**的东西，Software 2.0轻松自动化你能**验证**的东西"

### "A Recipe for Training Neural Networks" (2019年4月25日)
- **来源**: karpathy.github.io (一手)
- 被AI社区广泛引用的实操指南

### "microgpt" (2026年2月12日)
- **来源**: [karpathy.github.io](http://karpathy.github.io/2026/02/12/microgpt/) (一手)
- 200行纯Python代码训练和推理GPT，无任何依赖
- 是micrograd、makemore、nanogpt等多个项目的集大成之作

### "2025 LLM Year in Review" (2025年12月21日)
- **来源**: [karpathy.bearblog.dev](https://karpathy.bearblog.dev/year-in-review-2025/) (一手)
- 六大范式转变总结：
  1. RLVR（Reinforcement Learning from Verifiable Rewards）成为主导训练方法论
  2. LLM是"被召唤的幽灵"（Summoned Ghosts），不是进化的动物
  3. 传统benchmark日益不可靠（"benchmaxxing"="在测试集上训练的新艺术形式"）
  4. 应用层出现（Cursor代表了LLM应用的新"层"）
  5. "Vibe Coding"概念化
  6. LLM GUI演化

## 学术论文

### 核心论文
- **"ImageNet Large Scale Visual Recognition Challenge"** (IJCV 2015) - 与Olga Russakovsky, Jia Deng等合著，Karpathy贡献了人类 vs CNN在ImageNet分类上的对比分析。被引用超过30,000次。(一手)
- **"Deep Visual-Semantic Alignments for Generating Image Descriptions"** (CVPR 2015) - 与导师Fei-Fei Li合著，将CNN与双向RNN通过多模态嵌入对齐。(一手)
- **"Large-Scale Video Classification with Convolutional Neural Networks"** (CVPR 2014) (一手)
- **PhD论文**: "Connecting Images and Natural Language" (Stanford 2015, 导师Fei-Fei Li) (一手)
- Google Scholar总引用量: **78,147次** (二手，来自Google Scholar统计)

### CS231n 课程
- Stanford大学第一门深度学习课程
- Karpathy设计并担任主讲
- 2015年150人 → 2016年330人 → 2017年750人
- 来源: [cs231n.stanford.edu](https://cs231n.stanford.edu/) (一手)

## YouTube教学视频: Neural Networks: Zero to Hero

- **来源**: [karpathy.ai/zero-to-hero.html](https://karpathy.ai/zero-to-hero.html) (一手)
- 2022年8月开始发布，共7个视频的系列
- 从backpropagation基础 → MLP → CNN → GPT
- **"Let's build GPT"** 是最热门视频之一
- 教学风格：完整live coding，包括错误和修复过程
- 超过200万次观看

## 反复出现的核心论点（≥3次）

### 1. Software 2.0 / 3.0 范式演进
- **Software 1.0** = 代码（显式指令）
- **Software 2.0** = 权重（从数据优化的神经网络）
- **Software 3.0** = 提示（自然语言作为编程界面）
- 反复出现于：2017博客、2022 Lex Fridman播客、2025年多次推文、2025 keynote演讲

### 2. LLM OS（LLM操作系统）
- LLM不仅是工具/API，而是新兴操作系统
- "CPU"=推理能力，"RAM"=上下文窗口，"文件系统"=RAG知识访问
- LLM应作为"内核进程"运作

### 3. "March of Nines"（九的行军）
- 每增加一个9（90%→99%→99.9%→99.99%）需要与前一个同等量的工程努力
- 源自Tesla自动驾驶经验

### 4. "Summoning Ghosts, Not Building Animals"（召唤幽灵，而非构建动物）
- "我们不是在构建动物，我们在召唤幽灵或精灵...因为训练不是通过进化，而是通过模仿人类和他们放在互联网上的数据"

## 自创术语

| 术语 | 首次使用 | 含义 |
|------|----------|------|
| **Software 2.0** | 2017 Medium | 神经网络权重即程序 |
| **Software 3.0** | ~2023 | 提示/自然语言即编程接口 |
| **Vibe Coding** | 2025年2月 | "完全沉浸在氛围中，拥抱指数增长，忘记代码的存在" |
| **Agentic Engineering** | ~2026 | "99%时间你不直接写代码，你编排agents并作为监督" |
| **LLM OS** | ~2023 | LLM作为操作系统内核 |
| **LLM Wiki** | 2025-2026 | LLM"编译"原始数据为结构化wiki |
| **March of Nines** | ~2025 | 每增加一个可靠性数量级需等量工作 |
| **"The hottest new programming language is English"** | 2023年1月24日 | LLM时代自然语言即编程语言 |

## 推荐书单

**科幻**: Ted Chiang短篇集; Vernor Vinge《A Fire Upon the Deep》
**科学/生物学**: Richard Dawkins《The Selfish Gene》; Nick Lane《The Vital Question》《Life Ascending》
**历史**: Richard Rhodes《The Making of the Atomic Bomb》
**地缘政治**: Zeihan《The Accidental Superpower》
**网络安全**: 《Countdown to Zero Day》
**技术**: Goodfellow等《Deep Learning》; Sutton《Reinforcement Learning》

## 开源项目

| 项目 | 描述 | 状态 |
|------|------|------|
| **micrograd** | 微型自动微分引擎 | 教学用 |
| **minGPT** | GPT的最小PyTorch实现 | 半归档 |
| **nanoGPT** | 训练/微调中等规模GPT | 已被nanochat替代 |
| **nanochat** | "$100能买到的最好ChatGPT"，~8000行代码 | 活跃 |
| **microgpt** | 200行纯Python训练+推理GPT | 2026年2月发布 |
| **autoresearch** | AI自主研究agent，630行Python | 2026年3月，21K+ stars |
