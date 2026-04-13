# 著作与系统思考

## 核心论文与系统

### MapReduce (2004)
- **论文**: "MapReduce: Simplified Data Processing on Large Clusters", OSDI'04, 与Sanjay Ghemawat合著
- 将分布式计算的复杂性抽象化，使非专业程序员也能利用数千台商用机器处理大规模数据集
- 来源: research.google/people/jeff/ (一手)

### Bigtable (2006)
- **论文**: "Bigtable: A Distributed Storage System for Structured Data", OSDI'06
- 可扩展至数十亿行和数千列的稀疏表，保持低延迟、高吞吐，与MapReduce无缝集成

### Spanner (2012)
- **论文**: "Spanner: Google's Globally Distributed Database", OSDI 2012 Best Paper Award
- 全球分布式数据库，跨地理位置数据中心同步复制数据同时维持强一致性，支持SQL和ACID事务

### Word2Vec (2013)
- **论文**: "Distributed Representations of Words and Phrases and their Compositionality", NeurIPS 2013
- 合著者: Tomas Mikolov, Ilya Sutskever, Kai Chen, Greg Corrado, Jeff Dean
- 获NeurIPS 2023 Test of Time Award

### DistBelief → TensorFlow (2011-2015)
- 2011-2012年Dean带领小团队构建DistBelief，用于超大规模神经网络分布式训练
- 在主流模型仅1000万-5000万参数时，训练了20亿非嵌入参数的模型
- 后重构为开源TensorFlow

### Transformer论文 (2017)
- "Attention Is All You Need", NeurIPS 2017
- Dean作为资深作者(senior author)，非主要架构发明者
- 具体贡献：提供TPU基础设施、连接注意力机制与系统洞察、识别战略重要性

## 反复出现的核心论点（≥3次）

### 1. "Numbers Every Programmer Should Know" — 延迟直觉
- 约2010年演讲首次提出
- 程序员必须对不同操作的延迟量级有直觉：L1缓存 vs 内存 vs SSD vs HDD vs 网络
- 已成为系统设计领域的"经典"

### 2. 稀疏模型(Sparse Models) / 混合专家(MoE)是AI的未来
- 反复出现：Sequoia AI Ascent 2025, Dwarkesh Podcast 2025, Latent Space, Twitter
- "AGI是一个巨大的MoE，像森林一样逐步生长"
- 大脑节能的弱生物学类比

### 3. 算法与系统必须协同设计(Co-design)
- 贯穿整个职业生涯：从MapReduce到TPU到Gemini

### 4. 规模(Scale)驱动质量
- 但同时强调："AI最终进步需要一些额外的算法突破"

### 5. 能量(picojoules)而非FLOPs才是真正瓶颈
- "Energy in picojoules, not FLOPs, is becoming the true bottleneck"

## 自创术语与概念
- "Gemini"命名："because it's like twins coming together"（Brain和DeepMind合并）
- "Numbers Every Programmer Should Know"：已成行业标准
- Amdahl定律应用于AI Agent：工具启动时间成为瓶颈
