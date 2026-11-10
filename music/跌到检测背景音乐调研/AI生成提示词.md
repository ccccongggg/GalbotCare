# AI 生成紧急求助告警音乐 —— 提示词工程文档

> 配套文档：《跌倒检测背景音乐调研报告.md》V1.1 ｜ 版本：V1.1（调性已校准为"紧急告警"）
>
> 用途：跌倒检测 L2「紧急告警循环」音乐的 AI 生成。适用于 Suno、天工 SkyMusic、海绵音乐、网易天音等文生音乐模型。
> **核心定位：这是报警声，不是背景音乐。** 所有提示词均明确标注参考歌曲风格，并写入频段、速度、循环、升级结构等硬约束。紧迫感全部由节奏/速度/配器制造，禁止惊悚音色。

---

## 使用总则（生成前必读）

1. **情绪基准 = 紧急告警**：130–160 BPM、小调、2–4 小节急促动机反复捶打、逐层加速/加乐器（escalation 曲式）。
2. **主能量频段 400–2000 Hz**：紧迫感来自中音区急板断奏与鼓点，不是高频尖啸。
3. **必须可循环**：`seamless 20-second loop`，且鼓励"每轮更急更响"的升级变体。
4. **绝不能有的元素**：刺耳警报音色、恐怖片弦乐簇、失谐和声、突强惊吓音、人声歌词。
5. Suno 等模型建议用**英文提示词**，天工/海绵可用中文版。
6. 生成后用 Audacity 频谱抽查主能量频段；盲测 3 人，第一反应必须是"回头看"而不是"被吓一跳"。

---

## Prompt 1【L2 首选 · 自带升级结构】参考：《In the Hall of the Mountain King》（格里格《培尔·金特》）

**设计意图**：这首曲子的曲式本身就是"告警升级器"——同一主题反复、逐轮加速加响，完美对应"每循环渐强"的播放策略；公有领域，无版权风险。

### 中文提示词（天工 SkyMusic / 海绵音乐）

> 参考格里格《培尔·金特》中《山魔王的宫殿》的曲式与风格，生成一首机器人紧急求助告警音乐：小调急板，同一急促主题反复出现，每一轮速度加快、乐器加层、力度增强，营造"事态升级、刻不容缓"的压迫感；主奏为急板断奏弦乐与中音区拨弦，底层铺时钟滴答般的木鱼脉冲；130 BPM 起步逐渐推向 150 BPM；16 小节乐句可无缝循环；旋律能量集中在中音区；没有人声歌词，没有刺耳警报音，没有恐怖片式不协和音簇，紧迫感全部来自速度与节奏。

### 英文提示词（Suno）

```
Style: Style reference — Grieg's "In the Hall of the Mountain King" (Peer Gynt):
urgent minor-key staccato theme that repeats and escalates — each round faster,
denser and louder, building relentless "something is wrong, hurry" tension.
Driving staccato strings and mid-register pizzicato lead over a ticking
woodblock pulse like a racing clock. Starts 130 BPM and pushes toward 150 BPM.
A 16-bar phrase that loops seamlessly. Melody energy in the mid register
(400–2000 Hz). This is an emergency alarm for a fall-detection robot calling
for help — urgent and impossible to ignore, but never scary.
No vocals, no sirens, no horror stingers, no dissonant clusters, no jump scares.
```

### 负面提示（Negative / Exclude）

```
siren, alarm buzzer, horror strings, scream, spoken vocals, lyrics, distortion,
jump scare hit, dissonant cluster, high-pitched beeping above 4kHz
```

---

## Prompt 2【L2 备选 · 奔跑感】参考：《He's a Pirate》（加勒比海盗主题）

**设计意图**：电影级"快来人"的急板推进，公众认知度高，紧迫但不恐怖。

### 中文提示词

> 参考 Klaus Badelt《He's a Pirate》的急板配乐风格，生成一首机器人紧急求助告警循环音乐：小调急板提琴断奏连绵推进，定音鼓与急促鼓点如奔跑的脚步，140 BPM，传达"立刻需要帮助、请马上过来"的强烈奔跑感；8 小节核心动机反复捶打，可无缝循环约 20 秒；中音区为主能量；没有人声歌词，没有刺耳音色，没有恐怖元素，情绪是急迫与号召而非恐惧。

### 英文提示词（Suno）

```
Style: Style reference — Klaus Badelt's "He's a Pirate": driving presto
staccato strings in minor key with pounding timpani and urgent percussion,
140 BPM, evoking running feet and "come quickly, someone needs help".
An 8-bar core motive hammered in repetition, seamless 20-second loop.
Mid-register energy. Emergency-alarm urgency through tempo and rhythm only.
No vocals, no sirens, no horror elements, no dissonance.
```

---

## Prompt 3【L3 升级 · 事态升级脉冲】参考：《Lux Aeterna》（《梦之安魂曲》主题）

**设计意图**：影史最经典的"局势失控升级"配乐手法——弦乐脉冲逐层加急加密，用于 L3 无人响应阶段。

### 中文提示词

> 参考 Clint Mansell《Lux Aeterna》（《梦之安魂曲》主题）的升级式配乐手法，生成一首最高等级紧急告警音乐：中音区弦乐以短促脉冲动机起奏，随后节奏不断加密、声部不断叠加、力度持续爬升，制造"情况正在恶化、必须马上有人来"的强烈危机感；底层持续心跳般的低频鼓点（注意仍保持中频可听性）；145 BPM 以上；20 秒可无缝循环；没有人声歌词，没有尖锐刺音，没有恐怖音效，危机感来自节奏加密与力度爬升。

### 英文提示词（Suno）

```
Style: Style reference — Clint Mansell's "Lux Aeterna" (Requiem for a Dream
theme) escalation technique: mid-register strings play a short pulsing motive
that keeps accelerating, layering and growing louder — a rising "the situation
is critical, someone come NOW" crisis. A heartbeat-like pulse drum underneath
(keep energy audible in mid frequencies). 145 BPM or faster. Seamless
20-second loop. Maximum urgency built purely by rhythmic densification and
crescendo. No vocals, no shrill highs, no horror stingers, no dissonant clusters.
```

---

## Prompt 4【救护语义层 · 嵌入 SOS】参考：《Stayin' Alive》律动 + SOS 摩斯电码

**设计意图**：110 BPM = 国际 CPR 标准节奏；铃声层嵌入 SOS（三短-三长-三短），对受过急救培训的人是直接信号。

### 中文提示词

> 参考 Bee Gees《Stayin' Alive》的律动与节奏型，生成一首 110 BPM 的紧急求助音乐：轻量迪斯科弦乐与急促鼓点维持 CPR 按压节奏；铃声声部嵌入 SOS 摩斯电码节奏——三短、三长、三短，每轮循环出现，使音乐本身携带国际通用求救信号；情绪急迫、推进感强，但旋律明亮坚定，绝不惊悚；16 小节无缝循环；中音区为主；没有人声歌词，没有真实警笛采样，没有失真音色。

### 英文提示词（Suno）

```
Style: Style reference — the groove and rhythm of the Bee Gees' "Stayin' Alive"
at 110 BPM, the international CPR compression tempo. Light disco strings and
driving drums hold the steady rescue pulse. A bell layer embeds the SOS Morse
rhythm — three short, three long, three short — on every loop, carrying a
universal distress signal inside the music. Urgent and propulsive, yet bright
and resolute, never scary. Seamless 16-bar loop. Mid-register energy.
No vocals, no real siren samples, no distortion.
```

---

## Prompt 5【L1 询问阶段专用 · 温和版】参考：《卡农》

**设计意图**：仅用于"疑似跌倒、等待老人确认"阶段；一旦确认跌倒，立即切换到 Prompt 1/2 的紧急档。**此阶段不使用紧急告警音，避免误报打扰**（呼应 R-4 误报风险）。

### 中文提示词

> 参考 Pachelbel《卡农》的循环和声进行，生成一段温和的机器人确认提示音乐：八音盒与竖琴，约 80 BPM，8 小节主题循环两次后自然收尾，共约 30 秒，一次性播放不循环；像温和的居家门铃，引起注意但无压迫感；中音区；没有人声、没有打击乐、没有警报音。

### 英文提示词（Suno）

```
Style: Style reference — Pachelbel's Canon in D chord progression. Gentle
music box and harp, 80 BPM, an 8-bar theme stated twice then resolving
naturally (about 30 seconds, one-shot, not looped). A soft home doorbell
feel — noticeable but zero pressure. For a fall-check confirmation prompt,
not an alarm. Mid register. No vocals, no percussion, no sirens, no urgency.
```

---

## 生成结果验收清单

| 检查项 | 标准 | 工具 |
|---|---|---|
| 主能量频段 | 集中在 400–2000 Hz | Audacity 频谱分析 |
| 节奏/速度 | 130–160 BPM（L1 除外），动机重复密度高 | BPM 检测工具 |
| 升级感 | 循环渐强或配器加密结构成立 | 耳听 |
| 循环接缝 | 无爆音/断层，可无限循环 | 波形首尾比对 |
| 情绪盲测 | ≥3 人第一反应为"出事了，快过去看"，**0 人**说"被吓到/像恐怖片" | 现场测试 |
| 老人可听性 | 65 dB 下老人能清晰听到 | 分贝计 + 志愿者 |
| 时长 | 循环体 15–25 秒 | — |
| **输出格式** | **裸 PCM：s16le、16000 Hz、单声道**（SDK 扬声器流规格；`ffmpeg -i in.mp3 -ar 16000 -ac 1 -c:a pcm_s16le -f s16le out.pcm`） | ffprobe 检查 |
| 版权 | 确认平台商用授权条款；优先用公有领域风格（Prompt 1） | 平台协议 |
