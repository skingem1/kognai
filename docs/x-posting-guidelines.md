# X POSTING GUIDELINES — CMO REFERENCE
*Source: twitter/the-algorithm (open-sourced), xAI Grok algorithm (Jan 2026)*
*Load this file BEFORE generating any weekly communication plan.*
*Last updated: 2026-03-09*

---

## 1. HOW THE ALGORITHM DECIDES WHAT GETS SEEN

X's For You feed runs a 4-stage pipeline:

1. **Candidate retrieval** — ~1,500 tweets pulled from in-network (people you follow) and out-of-network (people you don't). Out-of-network tweets get a 0.75x scale penalty vs in-network.
2. **Feature hydration** — ~6,000 ranking signals computed per tweet.
3. **Heavy Ranker ML scoring** — neural network predicts 10 probabilities: like, retweet, reply, click, media engage, relevance, dwell, negative engage, report, "see less."
4. **Visibility filtering** — safety labels, blocks, mutes, NSFW filters applied last.

The algorithm is NOT time-based, NOT follower-count-based. It is **engagement-depth and sentiment-based.**

---

## 2. ENGAGEMENT SIGNAL WEIGHTS — THE EXACT NUMBERS

These are from the open-sourced scoring formula. Memorize them.

| Signal | Weight | What it means for us |
|---|---|---|
| Reply that gets author reply | **+75** | A reply chain where WE respond is 75x more valuable than a like |
| Reply to tweet | **+13.5** | Provoking replies is the #1 goal |
| Profile visit + engagement | **+12** | Posts that make people click our profile |
| Click into conversation + engage | **+11** | Threading works — people click in, then engage |
| Dwell time (2+ min) | **+10** | Long-form that holds attention |
| Bookmark | **+10** | "Save for later" = strong silent signal |
| Retweet/Repost | **+1.0** | Surprisingly low — retweets are NOT king |
| Like | **+0.5** | Weakest signal. Likes are nearly worthless |
| Video watch 50%+ | **+0.005** | Video completion barely registers alone |

**The scoring formula simplified:**
`Score = 0.5*P(Like) + 1.0*P(RT) + 0.3*P(Reply) + 0.15*P(ProfileClick) - 1.5*P(Report) - 3.0*P(Block)`

### What this means for every post we write:
- **Optimize for REPLIES, not likes.** One genuine reply chain = 150 likes.
- **Always reply back to early commenters.** Author-engaged reply chains are the single highest-weighted signal in the entire algorithm (+75).
- **Bookmarks matter more than retweets.** Write content worth saving.
- **Likes are vanity.** Stop measuring success by like count.

---

## 3. PENALTY SIGNALS — WHAT KILLS REACH

| Signal | Penalty | Recovery time |
|---|---|---|
| Tweet report (spam/abuse) | **-369x** | Weeks to months |
| Block by viewer | **-74x** | Account-wide reputation damage |
| Mute / "show less" | **-74x** | Months of sustained positive engagement |
| External link in tweet | **-30-50% reach** | Per-tweet (structural) |
| Mass unfollows | **3-month shadowban** | ~90 days |
| Duplicate/copy-paste posts | Spam flag | Variable |
| All caps text | Penalty | Per-tweet |
| Offensive/combative tone | Grok AI downrank | Persistent |
| More than 2-3 hashtags | Dampening | Per-tweet |

### Hard rules for the CMO:
1. **NEVER include external links in the main tweet body.** Put links in the first reply instead. Buffer's data: zero median engagement for link posts from free accounts since March 2025.
2. **NEVER use more than 2 hashtags.** 3+ triggers dampening. 0-1 is optimal.
3. **NEVER copy-paste identical content across posts.** Rewrite with different angles.
4. **NEVER post combative, sarcastic, or negative-tone content.** Grok AI scores sentiment and downranks negativity even if engagement is high.
5. **NEVER use all caps** for emphasis. Use line breaks and structure instead.

---

## 4. BOOST SIGNALS — WHAT AMPLIFIES REACH

| Signal | Effect |
|---|---|
| X Premium verification | 2-4x visibility boost |
| Early engagement velocity (first 30 min) | Exponential amplification |
| Image/GIF attachments | Moderate boost (increases dwell time) |
| Video with replies | Boosted if it generates conversation |
| Positive/constructive sentiment | Grok AI elevates helpful content |
| Thread format | Increases dwell time + reply surface area |
| Author replying to commenters | +75 per engaged reply chain |

### What this means operationally:
1. **Post when our audience is online.** The first 30-60 minutes determine the tweet's lifetime reach. Early velocity is ~50% of the total score.
2. **Time decay is steep.** A post loses half its potential visibility every 6 hours. Don't rely on "evergreen" — every post has a ~24h window.
3. **Always attach visual content.** Images stop the scroll and increase dwell time.
4. **Use threads for complex ideas.** Threads generate more replies per unit of content than standalone tweets, AND increase dwell time.
5. **The CMO or account owner MUST reply to early comments within 30 minutes.** This is non-negotiable. Author-engaged replies are the highest-weighted signal.

---

## 5. TWEEPCRED — ACCOUNT REPUTATION SCORE

Every X account has a hidden reputation score called TweepCred, based on PageRank adapted for social graphs.

**What increases TweepCred:**
- High follower-to-following ratio (don't mass-follow)
- Account age (older = more trusted)
- Consistent engagement from real accounts
- Verified/Premium status
- Device diversity (posting from app, web, API = natural behavior)

**What decreases TweepCred:**
- Following >> Followers (the ratio is penalized logarithmically)
- Mass follow/unfollow patterns
- Engagement from low-reputation accounts
- Reports, blocks, mutes from high-TweepCred accounts
- Suspended or restricted account history

### Rule for CMO:
- **Keep following count low.** Only follow accounts we genuinely interact with. The algorithm divides your reputation by a factor based on following-to-follower ratio.
- **Never do follow-for-follow campaigns.** They attract low-reputation followers and tank TweepCred.
- **Engage with high-reputation accounts in our niche.** Their interactions carry more weight.

---

## 6. SIMCLUSTERS — HOW X DECIDES WHO SEES OUR CONTENT

X groups all users into ~145,000 "communities" based on follow patterns (SimClusters). When someone engages with our tweet, the algorithm maps that engagement to their community and distributes the tweet to similar community members.

**What this means:**
- **Our first engagers define our audience.** If early likes/replies come from developers, the algorithm shows the tweet to more developers. If they come from random accounts, it goes to random feeds.
- **Engagement pods with off-topic accounts HURT.** They confuse SimClusters and send our content to the wrong communities.
- **Consistent niche content builds community association.** The more we tweet about fintech/AI/SaaS, the stronger our SimCluster embedding in those communities.

### Rules:
1. **Never use engagement pods or "like-for-like" groups.** They poison SimCluster targeting.
2. **Early engagement should come from accounts in our target niche.** DM our best content to 5-10 relevant accounts when we post — their engagement seeds the algorithm correctly.
3. **Stay on-topic.** Random off-topic posts dilute our SimCluster association. Keep a 80/20 ratio: 80% niche content, 20% personality/culture.

---

## 7. POST FORMAT HIERARCHY (ranked by algorithmic favorability)

**Tier 1 — Maximum reach:**
- Thread with image on first tweet + conversation-provoking hook
- Poll with strong opinion prompt
- Hot take / contrarian insight that demands replies

**Tier 2 — Strong reach:**
- Single tweet with image + question at the end
- Quote tweet with original analysis added
- Video (native, under 2 min) with text overlay

**Tier 3 — Moderate reach:**
- Text-only tweet with strong hook
- Retweet with comment
- Thread without images

**Tier 4 — Low reach (avoid):**
- Tweet with external link in body
- Tweet with 3+ hashtags
- Plain retweet (no added value)
- Copy-pasted promotional content

---

## 8. POSTING CADENCE RULES

| Rule | Rationale |
|---|---|
| 1-3 original posts per day | Quality over quantity. Algorithm penalizes spam patterns. |
| Minimum 2h gap between posts | Posting too frequently cannibalizes your own reach. |
| Reply to comments within 30 min | Author-engaged replies = +75 weight signal. |
| Threads: max 1 per day | Too many threads = scroll fatigue = mutes. |
| Never post between 1am-6am local audience time | Zero early velocity = dead tweet. |
| Best windows: 8-9am, 12-1pm, 5-7pm (audience local) | Maximize first-hour engagement velocity. |

---

## 9. CONTENT PRINCIPLES FOR INVOICA / KOGNAI

### Invoica (Financial OS — live beta):
- **Tone:** Professional but human. Builder-in-public energy. Never corporate-speak.
- **Topics:** Fintech pain points, automation wins, real metrics from our beta, SaaS lessons learned.
- **Hook patterns that work:** "X people told me [thing]. Here's what actually happened." / "We shipped [feature] this week. The result surprised us." / "Hot take: [contrarian opinion about fintech]."
- **CTA style:** Questions, not commands. "What's your experience with X?" not "Sign up now."

### Kognai (Sovereign AI Runtime — building in public):
- **Tone:** Technical but accessible. Pioneer energy. "We're building the future" without being cringe.
- **Topics:** Agent infrastructure, local-first AI, sovereignty, what we learned today, real sprint results.
- **Hook patterns:** "Today our AI swarm [did something specific]." / "Why [common AI approach] is broken, and what we're building instead." / "Sprint [N] results: [real numbers]."
- **Never:** Hype without substance. "AI will change everything" is banned. Show, don't tell.

---

## 10. WEEKLY COMMUNICATION PLAN TEMPLATE

When generating the weekly plan, the CMO MUST:

1. **Check audience timezone distribution** — schedule posts for their peak hours, not ours.
2. **Plan 5-10 original posts** across the week (1-2/day weekdays, 0-1 weekend).
3. **Plan reply engagement blocks** — 30 min after each post for author replies.
4. **Assign at least 2 posts as "reply-bait"** — posts designed to generate conversation (questions, polls, contrarian takes).
5. **Include 1 thread per week** — deep-dive content that shows expertise.
6. **No external links in any main tweet body.** Links go in reply #1 only.
7. **Pre-select 5-10 niche accounts to notify** when our best content drops (seed SimClusters correctly).
8. **Review last week's performance** — which post format generated the most replies? Double down.
9. **Include 1 "build in public" post** — real metrics, real failures, real progress. Authenticity scores highest with both the algorithm and humans.
10. **Never schedule more than 3 posts on any single day.** Quality concentration beats volume.

---

## 11. MEASUREMENT — WHAT TO TRACK

**Primary metrics (algorithm-aligned):**
- Reply count per post (most important)
- Reply chains where we responded (author-engaged conversations)
- Bookmark count (strong silent signal)
- Profile visits driven by posts
- Impressions-to-reply ratio (engagement quality)

**Secondary metrics:**
- Retweet count
- Like count (lowest priority — vanity metric)
- Follower growth rate
- Following-to-follower ratio (keep under 0.3)

**Kill switches:**
- 3+ posts in a row with 0 replies: stop posting, analyze what changed.
- Following/follower ratio exceeds 0.5: unfollow until under 0.3.
- Any post gets reported: investigate immediately, adjust tone.
- Engagement dropping 50% week-over-week for 2 weeks: full strategy review.

---

## SOURCES

This document was built from:
- [twitter/the-algorithm](https://github.com/twitter/the-algorithm) — open-sourced ranking code
- TweepCred (PageRank user reputation): `src/scala/com/twitter/graph/batch/job/tweepcred/`
- SimClusters (community detection): `src/scala/com/twitter/simclusters_v2/`
- Interaction Graph (engagement tracking): `src/scala/com/twitter/interaction_graph/`
- Home Mixer (For You feed construction): `home-mixer/`
- Visibility Library (content filtering): `visibilitylib/`
- Trust & Safety Models (content moderation): `trust_and_safety_models/`
- Unified User Actions (signal tracking): `unified_user_actions/`
- User Signal Service (implicit/explicit signals): `user-signal-service/`
- Topic Social Proof (topic classification): `topic-social-proof/`
- [X algorithm ranking factors breakdown (Social Media Today)](https://www.socialmediatoday.com/news/x-formerly-twitter-open-source-algorithm-ranking-factors/759702/)
- [Sprout Social — How the Twitter Algorithm Works in 2026](https://sproutsocial.com/insights/twitter-algorithm/)
- [Tweet Archivist — Complete Technical Breakdown](https://www.tweetarchivist.com/how-twitter-algorithm-works-2025)

---

*This document is a CMO bootstrap file. Load it every session before generating communication plans. Update it when X releases algorithm changes.*
