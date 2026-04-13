# Werner Vogels - Key Architectural & Strategic Decisions

## 1. Microservices Architecture at Amazon
- Championed two-pizza teams organizational model
- S3 evolved from 8 to 300+ microservices over its lifetime
- Set the template for service-oriented architecture at scale

## 2. Dynamo Architecture
- Chose eventual consistency for the shopping cart use case
- Discovered that 70% of Amazon's data access patterns were key-value
- Prioritized availability over strict consistency (AP in CAP theorem)

## 3. S3 Design
- Decentralized architecture with no single bottleneck
- **Pricing lesson**: Didn't anticipate request volume costs - underestimated how many small requests customers would make
- **Scale lesson**: Initial capacity estimates were blown through in 2 months

## 4. Serverless Push
- "No Server Is Easier To Manage Than No Server" as guiding principle
- Advocated async event-driven paradigm as the natural architecture model

## 5. Frugal Architect Framework (2023)
- Elevated cost awareness to a first-class architectural principle
- Defined 7 laws for cost-conscious system design
- Shifted industry conversation from "build fast" to "build sustainably"

## 6. DSQL Launch (2024)
- Global strongly-consistent database - a bet on solving distributed SQL at scale
- Addresses the long-standing tension between consistency and availability

## Notable Tensions
- **Frugal Architect vs AWS pricing**: Advocates cost awareness while AWS maintains high egress pricing
- **Serverless vs monolith**: Championed serverless, but Prime Video team publicly reverted from microservices to monolith for cost reasons
