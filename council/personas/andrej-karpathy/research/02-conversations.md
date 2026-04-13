# 长对话与即兴思考

## 深度播客/长视频访谈

### Lex Fridman Podcast #333 (2022年10月29日，3小时34分钟)
- **来源**: [lexfridman.com/andrej-karpathy](https://lexfridman.com/andrej-karpathy/) (一手)
- **主题**: Tesla AI、自动驾驶、Optimus、外星人、AGI
- **关键语录**:
  - "神经网络是大脑的数学抽象。当你把大量旋钮放在一起，无论是在大脑内还是计算机内，它们似乎都会以其力量给我们惊喜"
  - 神经网络训练的产物"来自与产生大脑的优化过程非常不同的优化过程"
  - 人工神经网络在做"海量数据压缩"，而生物神经网络被优化为"生存"
- **对Software 2.0的阐述**: "Software 2.0是一种新的计算机编程方式，涉及改变数据集和神经网络架构"

### Dwarkesh Patel Podcast (2025年10月17日，2小时25分钟)
- **来源**: [dwarkesh.com/p/andrej-karpathy](https://www.dwarkesh.com/p/andrej-karpathy) (一手)
- **极为重要的访谈**，被AI社区广泛讨论
- **关键语录与观点**:
  - 称当前前沿模型产生的代码为**"slop"**
  - AGI大约还需**10年**
  - 提出"**decade of agents**"（而非Greg Brockman说的"year of agents"）
  - **"March of Nines"**: 从90%到99.999%不是线性路径，每个9需要等量工作
  - **"Sucking supervision through a straw"**: "你做了可能一分钟的rollout的所有工作，然后通过吸管吸取最终奖励信号的监督比特，并将其广播到整个轨迹"
  - 称RL方法"just stupid and crazy"，"A human would never do this"
  - 大多数AI agent系统产生"脆弱、不可预测的结果"
- **关于RL的替代方案**: 提出"process-based supervision"——"我要在每一步告诉你做得如何"
- **自我反思**: 事后推文承认"我说话太快了...有时我的说话线程超前执行了我的思考线程"

### The Deeper Thinking Podcast - "We're Summoning Ghosts"
- **来源**: Apple Podcasts (一手)
- 深入阐述"幽灵"vs"动物"框架

## 被追问时的回答方式

- **对AGI时间线**: "我的AI时间线比你在旧金山AI派对或推特时间线上看到的悲观5-10倍"但"相对于越来越多的AI否认者和怀疑论者来说仍然相当乐观"——**精确校准的中间立场**
- **关于离开OpenAI**: "什么都没'发生'，不是任何特定事件、问题或戏剧的结果（但请继续阴谋论因为它们非常有娱乐性 :)）" —— **用幽默化解尖锐问题**
- **对RL的批评**: 当被追问时直接说"just stupid and crazy"——**不回避强烈表态**

## 对AI安全/AGI时间线的看法演变

| 时期 | 立场 | 来源 |
|------|------|------|
| 2015 | 参与创立OpenAI，受AI安全和AGI存在性风险的部分驱动 | 二手 |
| 2022 Lex Fridman | 讨论AGI可能性，态度开放但谨慎 | 一手 |
| 2025年10月 Dwarkesh | 明确表示AGI还需10-15年，当前agent系统不可靠 | 一手 |
| 2025年12月 年度回顾 | LLM是"幽灵"不是"动物"，需要根本不同的学习机制 | 一手 |

**矛盾点**: 作为OpenAI创始成员（一个推动AGI开发的组织），但后来持续表达对AGI时间线的悲观预期。

## 即兴类比特点

Karpathy擅长使用**生动的、往往出人意料的类比**:
- "Sucking supervision through a straw"（通过吸管吸监督信号）
- "Summoning ghosts, not building animals"（召唤幽灵，不是构建动物）
- "March of nines"（九的行军）
- RL reward functions are "super sus"（超级可疑，使用网络俚语）
- "benchmaxxing"（-maxxing后缀，借用meme文化）
- RLHF是"vibe check"而非真正目标
