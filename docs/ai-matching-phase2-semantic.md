# Phase 2 — 语义匹配(设计草案)

> 2026-08-11 · 设计文档,未动代码 · 目标:用"意义"替代"字面",让 growth marketing ↔ user acquisition 这类近义也能匹配

## 0. 现在的问题

所有引擎都是**字面重叠**:`arrayIntersect(skills_to_learn, can_help_with)`、子串 `fuzzyMatch`、token 交集。后果:
- "Growth marketing" 和 "User acquisition" 不匹配(没有共同词);
- "PM" 和 "Product Manager" 不匹配;
- 换个说法就错过。

## 1. 方案:嵌入(embedding)+ pgvector,**零外部成本**

用 **Supabase 边缘函数内置的 `gte-small` 模型**(384 维)把文本转成向量,存进 Postgres 的 `pgvector`,用**余弦相似度**算语义接近程度。

- ✅ **免费、无需新 API key**:`gte-small` 在 Supabase 边缘运行,不调外部服务、不按量计费。
- ✅ 快:向量预计算 + 向量索引,匹配时只做向量运算。
- ✅ 可扩展:换更强的模型/加 LLM 重排是后续增量,不推翻这套。

## 2. 关键设计:匹配要的是"互补",不只是"相似"

单个"画像向量"只会找到**相似**的人,但"谁能帮我"要的是**互补**。所以每个 profile 存**两个方向**的向量:

| 向量 | 由什么文本生成 |
|---|---|
| `offer_embedding` | 我能帮的:`can_help_with` + `headline` |
| `need_embedding` | 我想要的:`skills_to_learn` |

**语义互补分** = `cos(我的 need, 对方的 offer)` + `cos(我的 offer, 对方的 need)`
→ 语义版的"他能教我 + 我能教他",直接替代现在的字面 `arrayIntersect`。

(后续可再加 `interests_embedding` 做"相似/志趣"那一路,用于找联合创始人/朋友。v1 先做互补。)

## 3. 落地步骤

1. **迁移** `migration-semantic-embeddings.sql`:
   - `create extension if not exists vector;`
   - `alter table profiles add column offer_embedding vector(384), add column need_embedding vector(384), add column embedding_updated_at timestamptz;`
   - 向量索引(ivfflat / hnsw)。
2. **边缘函数** `embed-profile`:读某用户 profile → 用 `gte-small` 生成两个向量 → 写回。
   - 触发时机:用户存 profile 后,前端 `functions.invoke('embed-profile')`(fire-and-forget);首次上线跑一次批量 backfill(对所有已 onboarded 用户)。
3. **接进 Smart Match**:`match-suggestions` 里,把现在的"技能教/学 20 分"那一桶,升级为**语义互补分**(用 SQL 侧 pgvector 算相似度,或在函数里算)。保留其它桶(兴趣、意图、共同点)。字面命中仍可作为加成,保证向后兼容。
4. **理由**:语义匹配可以生成更自然的理由(如 "Your interest in fundraising aligns with their VC background"),接进已有的 2–3 条 reason chip。

## 4. 先在哪落地

**先只做 Smart Match**(`match-suggestions` 边缘函数 + `match_nudges`):它已经是服务端打分,最适合接向量;人对人也最能体现语义互补。跑通、验证质量后,再决定要不要推给 Discover 刷卡(那是帖子↔人,是另一套映射)。

## 5. 需要你拍板

| # | 决策 | 我的建议 |
|---|---|---|
| A | 用 Supabase 免费 `gte-small`,还是接外部更强的 embedding(OpenAI 等,要 key+成本)? | **先用免费 `gte-small`**,够验证语义提升;不够再升级 |
| B | 先只做 Smart Match,还是同时改 Discover? | **先只做 Smart Match**,降低风险 |
| C | v1 只做"互补"(offer/need),还是也加"相似"(interests)? | **v1 只做互补**,加兴趣留下一轮 |
| D | 之后要不要加 LLM 重排 top-K(更准的理由,但有成本)? | v2 再说,先把嵌入这层跑通 |

## 6. 工作量与风险

- 中等偏上:一条迁移 + 一个新边缘函数 + 改 Smart Match 打分 + 一次批量 backfill。
- 风险点:pgvector 扩展要在 Supabase 开启(一条 SQL);`gte-small` 384 维质量中等(足够 v1);profile 更新要记得触发重嵌入(用 `embedding_updated_at` 兜底批处理)。
- **无破坏性**:纯增列 + 新函数;字面匹配作为兜底保留,嵌入缺失时自动退回旧逻辑。
