# Local agent — gerçek agent test planı

Bu dalda AI chat penceresine ve konuşma modeline eklenen özelliklerden **agent'a göre değişebilenleri**, her coding agent ile elle doğrulamak için.

Bir davranış şu durumlarda agent'a göre değişir: agent'ın ne gönderdiğine bağlıysa (ACP olayları, yetenekleri, komutları, modelleri, kullanım bilgisi, soruları, planı, diff'leri, resimleri) ya da agent'ın nasıl tepki verdiğine bağlıysa. Agent'tan bağımsız console davranışları en sondaki "Tek seferlik console kontrolleri" bölümünde; onlar bir kez, herhangi bir agent ile test edilir.

Her testte:
- **Ölç:** neyin doğrulandığı.
- **Prompt:** agent'a yazılacak metin. İngilizce ve kopyalanabilir.
- **Beklenen:** console'da ne görünmeli.
- **Log:** bridge log'unda neye bakılacağı.

Agent'lar: Claude Code (`claude`), Codex (`codex`), Cursor (`cursor`), Pi (`pi`), Gemini CLI (`gemini`), GitHub Copilot (`copilot`), OpenCode (`opencode`).

Bir prompt agent'a belirli bir ACP olayını gönderttiremiyorsa (soru, plan, link isteği, resim bloğu gibi), o agent için N/A yaz. Bridge testlerindeki sahte agent bu olayların hepsini zaten kapsıyor.

## Hazırlık

### Test klasörü

Her agent için temiz bir klasör. Git deposu `/review` ve diff testleri için gerekli.

```bash
rm -rf /tmp/agent-test && mkdir -p /tmp/agent-test && cd /tmp/agent-test
git init -q
cat > trades.sql <<'EOF'
SELECT symbol, avg(price) AS avg_price
FROM trades
WHERE timestamp IN '$today'
SAMPLE BY 1h;
EOF
printf 'alpha\nbeta\ngamma\n' > notes.txt
python3 - <<'PY'
import random
random.seed(1)
words = 'time series database partition column symbol price amount ingest query sample latest'.split()
# Context testi için ~100K token
open('big.txt', 'w').write('\n'.join(' '.join(random.choice(words) for _ in range(12)) for _ in range(8000)))
# Tool çıktısı sınırı (8000 karakter) için
open('output-9000.txt', 'w').write('\n'.join(f'line {i:05d} ' + 'x' * 40 for i in range(190)))
# "Too large to show" diff'i (>200.000 karakter) için
open('wide.txt', 'w').write('\n'.join('row ' + str(i) + ' ' + 'y' * 90 for i in range(2500)))
PY
git add . && git -c user.email=t@t -c user.name=t commit -qm init
```

Ayrıca hazırla:
- Belirgin içerikli küçük bir PNG; örneğin kırmızı zemin üstünde mavi daire.
- QuestDB'de `trades` tablosunda en az 10 satır.

### Çalıştırma

```bash
cd ~/Desktop/ui && yarn start                       # http://127.0.0.1:9999
cd ~/Desktop/questdb/mcp-server-acp && yarn build
node dist/index.js serve --agent <id> --cwd /tmp/agent-test --console-origin http://127.0.0.1:9999
```

- **Log:** `/tmp/questdb-mcp-bridge/` altındaki en yeni dosya. Tool argümanları için `LOG_LEVEL=DEBUG`.
  - Log'da prompt'lar ve cevap metinleri yok. Bir testin bunları görmesi gerekiyorsa, `/tmp/acp-spike/census.mjs` ile ham ACP olaylarını kaydet.
- **Her test için:** yeni bir sohbet aç (sağ üstte `+`).
- **Başarısız bir testte şunları not et:**
  - ekran görüntüsü
  - log'daki ilgili satırlar
  - agent sürümü (`~/.questdb/mcp-bridge/agents/` altındaki klasör adı)

### Sonuç tablosu

Her hücreye ✅ (çalışıyor), ⚠️ (kısmen; nota yaz), ❌ (çalışmıyor) ya da N/A (agent desteklemiyor) yaz.

| # | Test | Claude | Codex | Cursor | Pi | Gemini | Copilot | OpenCode |
|---|------|--------|-------|--------|----|--------|---------|----------|
| 1 | Eşleştirme ve başlangıç | | | | | | | |
| 2 | Giriş ve agent hataları | | | | | | | |
| 3 | Agent sürecinin çökmesi | | | | | | | |
| 4 | Model seçimi | | | | | | | |
| 5 | Effort seçimi | | | | | | | |
| 6 | Artık sunulmayan kayıtlı model | | | | | | | |
| 7 | Markdown cevap | | | | | | | |
| 8 | Düşünme adımı | | | | | | | |
| 9 | Adımlar, başlıklar ve süreler | | | | | | | |
| 10 | Tool ikonları ve geçici adımlar | | | | | | | |
| 11 | Tool çıktısı | | | | | | | |
| 12 | Uzun komut | | | | | | | |
| 13 | Başarısız adım ve devam | | | | | | | |
| 14 | Diff'ler | | | | | | | |
| 15 | Plan | | | | | | | |
| 16 | Bildirimler ve durma sebepleri | | | | | | | |
| 17 | Zengin içerik blokları | | | | | | | |
| 18 | Soru kartı | | | | | | | |
| 19 | Soru türleri ve tipli cevaplar | | | | | | | |
| 20 | Soru ve yeniden bağlanma | | | | | | | |
| 21 | Link isteği | | | | | | | |
| 22 | Context halkası | | | | | | | |
| 23 | Compaction | | | | | | | |
| 24 | Resim gönderme | | | | | | | |
| 25 | Resim alma | | | | | | | |
| 26 | Slash komutları | | | | | | | |
| 27 | Steer | | | | | | | |
| 28 | Durdurma ve Retry | | | | | | | |
| 29 | QuestDB tool'ları ve notebook | | | | | | | |
| 30 | İzinlere tepki | | | | | | | |
| 31 | Sayfa yenileme | | | | | | | |
| 32 | Bridge yeniden başlatma | | | | | | | |
| 33 | Bağlantı kopması | | | | | | | |
| 34 | Model ve agent geçişleri | | | | | | | |
| 35 | Birden çok sohbet | | | | | | | |

---

## A. Bağlantı ve agent durumu

### 1. Eşleştirme ve başlangıç

**Ölç:** Console'un agent'ı tanıması, consent penceresinin doğru bilgiyi göstermesi, agent'ın hazır hâle gelmesi.

**Adımlar:** Bridge'i başlat, terminaldeki pairing linkini aç.

**Beklenen:**
- **Onay penceresi:**
  - Başlık "Connect \<Agent\>?".
  - "Workspace:" satırında `/tmp/agent-test`.
  - Pencere, agent'ın sormadan dosya düzenleyip komut çalıştırabileceğini söyler.
- **Onaydan sonra:**
  - "\<Agent\> connected" mesajı görünür.
  - Sohbet kendiliğinden açılır ve agent seçili gelir.
- **Alt çubuk:**
  - Agent başlarken "\<Agent\> starting…", hazır olunca "\<Agent\> connected".
  - Tooltip: "\<Agent\> runs on your computer through the QuestDB bridge. Click to manage."
- **Model seçici:**
  - Agent model listesi veriyorsa "\<model\> · \<Agent\>", vermiyorsa yalnızca "\<Agent\>". Agent ikonu terminal.
  - Agent hazır olana kadar listede "Starting \<Agent\>" görünür.
- **İlk mesaj:**
  - Agent hazır olduktan sonra gönderilirse, önceden açılmış oturum sayesinde beklemeden gider.
  - Agent hâlâ başlıyorsa beklemesi normal.

**Log:** `starting agent: <Agent>`. Ardından `WARN` ya da `ERROR` olmamalı.

### 2. Giriş ve agent hataları

**Ölç:** Hataların okunur metne çevrilmesi ve gösterildikleri yer. Başlangıç hataları model seçicide ve ayarlarda, mesaj sırasındaki hatalar cevapta görünür.

**Adımlar ve beklenen:**
1. **Başlangıçta giriş yok.** Agent'tan çıkış yap. Codex'te `/logout`; diğerlerinde kimlik dosyasını geçici olarak taşı. Sonra bridge'i başlat.
   - Model seçicideki agent bölümünde agent'a özel giriş talimatı ve "Start again" görünür. Örnek: "Sign in to Codex: run `codex login`, or set OPENAI_API_KEY…"
   - Alt çubuk "\<Agent\> unavailable" gösterir; tooltip hatanın kendisi.
   - Giriş yapıp "Start again"e basınca agent hazır olur.
   - Ortam değişkenleri (API key) çalışan bridge'e sonradan geçmez. Onları değiştirdiysen bridge'i yeniden başlat.
2. **Mesaj sırasında hata.** Örneğin Gemini'yi `GEMINI_API_KEY=invalid` ile başlat (OAuth girişini geçici olarak taşı). Prompt: `Reply with READY only.`
   - Hata cevapta okunur metin olarak görünür ve Retry butonu çıkar. İç içe JSON görünmemeli.
3. **Copilot, Copilot CLI hakkı olmayan hesapla.** Prompt: `Reply with READY only.`
   - "Your GitHub account cannot use Copilot CLI. Check your Copilot plan, or ask your organization to allow Copilot CLI."
4. **Ayarlar.** Composer'daki "Assistant settings" butonunu aç ve agent sekmesine geç.
   - Agent adı ve durum etiketi: Ready, Starting ya da Unavailable.
   - "Status" satırında hata varsa hata ve "Start again".
   - "Workspace" satırında `/tmp/agent-test`.

**Log:** `agent turn failed: <aynı metin>` (2. ve 3. adımlar).

**Not:** Copilot ve OpenCode'un giriş talimatı "then start the agent again" der.

### 3. Agent sürecinin çökmesi

**Ölç:** Agent süreci beklenmedik şekilde kapanınca console'un durumu doğru göstermesi ve yeniden başlayabilmesi.

**Adımlar:**
1. Uzun bir iş başlat: `Read big.txt and count the occurrences of every distinct word, then print them sorted.`
2. Agent sürecini öldür. Süreç adına göre: `claude-agent-acp`, `codex-acp`, `cursor-agent`, `pi-acp`, `gemini`, `copilot`, `opencode`. Örnek: `pkill -9 -f codex-acp`.
3. Yeni bir mesaj gönder: `Reply with BACK only.`

**Beklenen:**
- Çalışan cevap bir hata satırıyla biter.
- Agent bölümünde "The agent stopped. Start it again to continue." ve "Start again" görünür. Alt çubuk "\<Agent\> unavailable".
- Yeni mesaj agent'ı kendiliğinden yeniden başlatır ve cevap gelir. Agent, oturum yeniden açıldıysa sohbeti hatırlar.
- OpenCode: hata durumu yok, yalnızca o sohbetin süreci yeniden başlar.

**Log:** `agent process exited (code=…, signal=SIGKILL)`, sonra `starting agent: <Agent>`.

---

## B. Model ve effort

### 4. Model seçimi

**Ölç:** Agent'ın model listesinin gelmesi, seçimin agent'a iletilmesi, her cevabın hangi modelle verildiğini göstermesi.

**Adımlar ve beklenen:**
1. **Seçiciyi aç.**
   - Agent'ın modelleri "Local agent" başlıklı ayrı bir grupta.
   - Açıklamalar okunur; başlarında "\<model\> · " tekrarı yok.
   - Seçili model işaretli.
   - Model listesi vermeyen agent'larda "Default model" görünür.
2. **Model A'yı seç** ve `Say hi.` gönder. **Model B'yi seç** ve yine `Say hi.` gönder.
   - Fareyi cevapların üzerine getir. Birinci cevabın altında "\<A\> · \<Agent\> · \<süre\>", ikincisinde "\<B\> · \<Agent\> · \<süre\>" yazar.
   - Model listesi olmayan agent'larda model adı yerine yalnızca agent adı görünür.
3. **`/model <adın benzersiz bir kısmı>`.**
   - Sohbet akışında "Model set to … · \<Agent\>" notu çıkar.
   - Yazılan kısım birden çok modelle eşleşirse "“…” matches several models: … Be more specific." çıkar. Eşleşmeye API modelleri de dahil.
4. **Sayfayı yenile.**
   - Seçili model ve cevapların altındaki model ve süre bilgileri aynı kalır.

**Log:**
- `agent setting: <configId> = <model>`. Bu satır yalnızca bir **değişiklik** kabul edildiğinde yazılır; aynı model tekrar seçilirse satır gelmez.
- Ayar bir sonraki mesajın başında uygulanır.

**Agent'a özel:** Codex'te `/status` çıktısında modeli görebilirsin.

### 5. Effort seçimi

**Ölç:** Effort kontrolünün yalnızca destekleyen modelde görünmesi, listenin modele göre değişmesi, seçimin agent'a iletilmesi.

**Adımlar ve beklenen:**
1. **Effort'u olan bir model seç.**
   - "Effort \<seviye\>" seçicisi görünür ve seviyeler agent'ın verdiği adlarla listelenir.
   - Bir seviye seç ve `Count from 1 to 3.` gönder.
2. **`/effort <seviye>`.**
   - "Effort set to …" notu.
   - Geçersiz seviyede: "No effort level “…”. Choose …".
3. **Farklı effort seviyeleri olan bir modele geç**, `Count from 1 to 3.` gönder.
   - Cevaptan sonra seçici yeni modelin seviyelerini listeler.
   - Yeni modelde olmayan bir seviye uygulanmaz ve hata çıkmaz.
4. **Effort'u olmayan bir model ya da agent.**
   - Seçici görünmez ve `/` menüsünde `/effort` yok.
   - `/effort` yazıp Enter'a basınca kırmızı not: "This model has no effort setting." Mesaj agent'a **gitmez**.

**Log:** her değişiklik için bir `agent setting:` satırı; effort satırı model satırından sonra gelir.

**Not:** Yüksek effort'un daha uzun düşünmesi beklenir ama garanti değil; başarı ölçütü olarak kullanma.

### 6. Artık sunulmayan kayıtlı model

**Ölç:** Kayıtlı model agent'ın listesinde artık yoksa, sohbetin bozulmadan agent'ın geçerli modeline düşmesi.

**Adımlar:**
1. Tarayıcı konsolunda `localStorage` içindeki `ai.assistant.settings` → `localAgent.preferences.<agent id>.model` değerini `retired-model` yap.
2. Sayfayı yenile ve `Reply with OK only.` gönder.

**Beklenen:**
- Seçici agent'ın geçerli modelini işaretli gösterir.
- Mesaj hatasız gider.

**Log:** `agent setting: … = retired-model` satırı yok.

---

## C. Cevap ve adımlar

### 7. Markdown cevap

**Prompt:** `Answer in markdown: a heading "Sampling", one sentence with a **bold** word and an inline code span SAMPLE BY, a two-item bullet list, and a short sql code block.`

**Beklenen:**
- Cevap akarak gelir.
- Başlık, kalın, satır içi kod, liste ve kod bloğu doğru çizilir.
- Agent birden çok ayrı mesaj gönderirse, mesajlar arasında boş satır olur ve metin yapışmaz.

### 8. Düşünme adımı

**Prompt:** `Think step by step about whether 2147483647 is prime, then answer only "yes" or "no".`

**Beklenen:**
- Cevap sürerken bir "Thinking" adımı görünür; açınca agent'ın düşünmesi soluk metinle akar.
- Cevap metni yalnızca sonucu içerir; düşünme metni cevaba karışmaz.
- Düşünmesini göndermeyen agent'larda Thinking adımı yok: N/A.

### 9. Adımlar, başlıklar ve süreler

**Prompt:** `List the files in the current folder, then read notes.txt, then tell me how many lines it has.`

**Beklenen:**
- **Cevap sürerken:**
  - Adımlar "Using agent tools" altında tek tek belirir; çalışan adımda spinner döner.
  - Bir saniyeden uzun sessizlikte "Working" görünür.
- **Başlıklar:**
  - Adım başlığı agent güncelledikçe değişir; agent daha iyi bir başlık gönderirse gerçek komut ya da dosya adı görünür.
  - Agent daha iyi bir başlık göndermezse genel başlık kalabilir. Bunu ⚠️ olarak not et.
- **Bitince:**
  - Başlık "Worked for X" olur.
  - Her adım kendi süresini gösterir. Adım sürelerinin toplamının "Worked for" süresine eşit olması gerekmez.

**Log:** izin isteyen agent'larda her tool için `auto-approved: …`. `WARN` ya da `ERROR` olmamalı.

### 10. Tool ikonları ve geçici adımlar

**Prompt:** `Search the current folder for the word "gamma", read notes.txt, then fetch https://example.com and tell me its page title.`

**Beklenen:**
- Her adımın ikonu türüne göre:
  - arama: büyüteç
  - okuma: dosya
  - web isteği: küre
  - kabuk komutu: terminal
  - düzenleme: kalem
  - bilinmeyen tür: anahtar
- Codex'te kısa süreli adımlar:
  - Bir tool çağrısı incelenirken "Reviewing tool call".
  - Tool araması sırasında "Loading tools".
  - İkisi de bitmiş cevabın geçmişinde kalmaz.

### 11. Tool çıktısı

**Prompt:** `Run "cat output-9000.txt" and then "ls -la" in the shell. Do not repeat the output in your reply.`

**Beklenen:**
- Adıma tıklayınca açılır: komut monospace kutuda, çıktısı altında.
- `output-9000.txt` çıktısı 8000 karakterde kesilir ve sonunda "…" görünür. Sınır her çıktı bloğu için ayrı uygulanır.
- Çıktıda kod çiti (```) kalıntısı yok.
- Çıktı akarken açık olan adım açık kalır.

**Agent'a özel:** Codex komut çıktısını yalnızca terminal referansı olarak gönderir. Bu durumda çıktı görünmez: ⚠️ yaz, bilinen bir durum.

### 12. Uzun komut

**Prompt:** `Run this exact shell command: echo one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty twenty-one twenty-two twenty-three twenty-four twenty-five twenty-six twenty-seven twenty-eight twenty-nine thirty && echo done`

**Beklenen:** Komutun tamamı adımın kutusunda görünür; agent başlığı kesmiyorsa kısaltma yok.

### 13. Başarısız adım ve devam

**Prompt:** `Run "cat does-not-exist.txt" in the shell. Then read notes.txt. Tell me which of the two worked.`

**Beklenen:**
- İlk adım kırmızı ✕ ile işaretlenir.
  - Altında sebep görünür: agent'ın metni ya da çıktının ilk 500 karakteri.
  - Sebep yoksa "Failed" yazar.
- Yalnızca o adım işaretlenir; ikinci adım normal tamamlanır.
- Agent hangisinin çalıştığını doğru söyler.

### 14. Diff'ler

**Prompt 1 (düzenleme):** `In notes.txt replace beta with BETA. Then in trades.sql change SAMPLE BY 1h to SAMPLE BY 15m. Make no other changes.`

**Beklenen:**
- Düzenleme adımı açılınca satır içi diff görünür.
  - Değişmeyen bölgeler gizli.
  - Başlıkta "+N/−M" sayıları var.
- `trades.sql` SQL olarak renklendirilir; `notes.txt` düz metin.
- Tarayıcı konsolunda Monaco dil paketi 404'ü yok.
- Bir düzenleme birden çok adıma, bir adım birden çok diff'e bölünebilir. Örneğin Claude hunk hunk gönderir; bu normal.

**Prompt 2 (yeni dosya):** `Create a file named report.md with a heading "Report" and two bullet points.`

**Beklenen:**
- Agent eski içeriği boş (`oldText` yok) gönderirse "New file" etiketi görünür ve içerik tam editörde açılır.
- Agent yeni dosyayı normal düzenleme gibi gönderirse diff görünür. Bunu not et.

**Prompt 3 (büyük diff):** `In wide.txt replace every "y" with "z".`

**Beklenen:** Diff 200.000 karakteri aşarsa editör açılmaz, "Too large to show" yazar.

**Temizlik:** `git checkout -- . && rm -f report.md`

### 15. Plan

**Prompt 1:** `First make a 3-step todo plan, then do it: 1) list the files, 2) count the lines in notes.txt, 3) summarize in one sentence. Update the plan as you go.`

**Beklenen:**
- "Plan n/m" bölümü görünür; sayaç ilerler ve aynı bölüm yerinde güncellenir. Planın 0/3'ten başlaması gerekmez.
- Cevap sürerken plan açık kalır ve bölümün başlığında spinner döner.
- Madde ikonları:
  - biten: check'li daire, soluk, üstü çizili değil
  - çalışan: yarı dolu daire
  - bekleyen: boş daire
- Hepsi bitince başlıkta check görünür.

**Prompt 2 (yarım kalan):** Prompt 1'i tekrar gönder ve ilk madde bitince Stop'a bas.

**Beklenen:** Bölüm başlığında kesik çizgili daire (spinner ya da check değil); sayaç kaldığı yerde kalır, örneğin 1/3.

**Agent'a özel:**
- Claude planı TodoWrite ile, Codex update_plan ile gönderir.
- Plan aracı olmayan agent'lar planı düz metin olarak yazar: N/A.

### 16. Bildirimler ve durma sebepleri

**Ölç:** Agent notlarının satır içinde görünmesi; turun olağandışı biçimde bitmesinin açıklanması.

**Nasıl tetiklenir:**
- Bildirimler agent'a bağlı: hook'lar, kota uyarıları, model düşürme. Doğal olarak gelirse not bloğu olarak görünür.
- Çıktı sınırı (max_tokens) için: `Write the numbers from 1 to 50000, one per line, without skipping any.`
- Adım sınırı ve reddetme agent ayarına bağlı; tetiklenemezse N/A.

**Beklenen:**
- Notlar ikon (bilgi/uyarı/hata), başlık ve altında ayrı satırda açıklama olarak görünür.
- **Çıktı sınırı:** "The agent reached its output limit", altında "Its answer may be cut off. Ask it to continue where it stopped."
- **Adım sınırı:** "The agent reached its step limit".
- **Reddetme:** "The agent declined to continue".
- **Bilinmeyen sebep:** "The agent stopped", altında "It gave this reason: ….".
- Oturum yeniden açılırken gelen bildirimler sohbette görünmez, yalnızca log'a yazılır.

**Log:** `agent notice: <başlık> (<açıklama>)`.

### 17. Zengin içerik blokları

**Prompt:** `Attach notes.txt to your reply as an embedded file resource, not as plain text, and also give me a resource link to trades.sql.`

**Beklenen:**
- **Gömülü dosya:** kod yazı tipinde dosya adı ve altında içeriği kod bloğunda (en fazla 20.000 karakter).
- **Resource link:** `trades.sql` kod olarak görünür; tıklanabilir bir console adresi değil.
- **İkili dosya:** "*(a binary file, not shown)*". **Ses:** "*The agent sent audio…*".
- Agent yalnızca düz metin gönderiyorsa: N/A.

---

## D. Sorular ve link istekleri

### 18. Soru kartı

**Ölç:** Agent'ın sorusunun (ACP form elicitation) kartla gösterilmesi, cevabın agent'a ulaşması, geçmişte kalması.

**Prompt 1 (tek soru):** `Use your tool for asking the user a question: ask me which table to analyze, with the options trades, fx_trades and market_data. Then tell me which one I chose. Do not do anything else.`

**Beklenen:**
- Mesaj kutusunun yerine "\<Agent\> asks" kartı gelir.
- Rakam tuşlarıyla seçilir. "Type your own answer" satırı formda serbest cevap alanı varsa görünür; o zaman sıradaki rakam onu açar.
- Tek seçimli tek soruda seçim hemen gönderilir. Agent seçimi doğru tekrar eder.
- Sohbet geçmişinde soru ve cevap kayıt olarak kalır.

**Prompt 2 (çoklu soru):** `Using your question tool, ask me two questions at once: my preferred time bucket (1m, 15m, 1h) and whether to include volume (yes/no). Then repeat my answers.`

**Beklenen:**
- Sekmeli kart; ←/→ ile gezilir.
- Son sekme "Review": cevapları özetler, cevaplanmayanlarda "Not answered" yazar. Ardından Send.

**Prompt 3 (Skip, Stop, Esc):** Prompt 1'i tekrar gönder.
- "Skip": cevap reddedilmiş (decline) olarak gider. Agent devam edebilir ya da durabilir; ikisi de geçerli. Kayıtta "Skipped" yazar.
  - Codex'in çalışmaya devam ederken sorduğu (asenkron) sorularda Skip, "The user skipped this question without answering." cevabı olarak gider. Codex birkaç saniye içinde soruyu geçtiğini söylemeli; beklemeye devam edip "haven't received a selection yet" derse ❌.
- Yeniden dene ve "Stop the agent"a bas: tur durur, kart kaybolur ve geçmişte soru kaydı **kalmaz**.
- Esc hiçbir cevabı tetiklemez.

**Agent'a özel:**
- Claude AskUserQuestion, Codex request_user_input, OpenCode question aracını kullanır.
- **Codex:** "None of the above" seçeneği görünmez; console onu kendisi doldurur.
- **Gemini:** `ask_user` izin isteği olarak geliyor ve soru kullanıcıya ulaşmıyor; bu bilinen bir sorun. Log'da soru uyarısının olmaması, sorunun ulaştığı anlamına gelmez.
- **Soru aracı olmayan agent'lar** (Pi gibi) soruyu düz metinle sorar: N/A.

### 19. Soru türleri ve tipli cevaplar

**Prompt:** `Use your question tool to ask me in a single form: which markets to include (multiple choice: BTC, ETH, SOL), a required integer row count, and an optional free-text note. Then report exactly what you received, including the value types.`

**Adımlar:** ETH'yi, sonra BTC'yi seç; row count'a `10` yaz; notu boş bırak.

**Beklenen:**
- Çok seçimli soru "Select all that apply" ve onay kutularıyla görünür; "Next" ve "Review" butonları var.
- Metin alanında "Type your answer" yazar.
- Zorunlu alan boşken Send çalışmaz.
- Agent bir dizi (`["BTC","ETH"]`, seçenek sırasıyla) ve bir sayı (`10`) aldığını söyler; boş bırakılan isteğe bağlı not gönderilmez.
- Evet/hayır sorusu iki seçenek olarak görünür.

**Log:** form desteklenmeyen bir yapıdaysa `agent asked a question the console cannot show`. Bu durumda kart açılmaz.

### 20. Soru ve yeniden bağlanma

**Adımlar:**
1. Test 18'in Prompt 1'ini gönder.
2. Kart açıkken ağ bağlantısını 10 saniye kes, sonra geri getir. Sayfayı yenileme.
3. Kartta bir seçenek seç.

**Beklenen:** Yeniden bağlandıktan sonra aynı kart tek kopya hâlinde durur ve cevap agent'a ulaşır.

### 21. Link isteği

**Ölç:** ACP URL elicitation'ın kartla gösterilmesi.

**Nasıl tetiklenir:** Genellikle girişi gereken bir MCP sunucusu (OAuth) ya da agent'ın kendi web girişi tetikler. Prompt örneği: `Use the test service and ask me to open its sign-in page. Do not put the sign-in URL in your reply.` Doğal yoldan tetiklenemiyorsa N/A yaz.

**Beklenen:**
- Kart "\<Agent\> asks you to open a page" başlığıyla gelir: agent'ın mesajı, önce host, sonra tam adres, ardından "Opens in a new tab. Finish there, then come back here."
- "Open page" yeni sekmede açar ve isteği **hemen** kabul eder (OAuth'un bitmesi beklenmez).
- "Copy link" yalnızca adresi kopyalar, cevap vermez.
- "Cancel" isteği reddeder.
- Geçmişteki kayıt agent'ın mesajını (ya da "Open \<host\>") ve "Opened \<host\>" ya da "Not opened" sonucunu gösterir.
- Agent isteği kendisi kapatırsa (`elicitation/complete`) kart kaybolur ve kayıt eklenmez.

**Log:** web sayfası olmayan bir adres için `agent asked to open a link that is not a web page`.

---

## E. Context ve compaction

### 22. Context halkası

**Ölç:** Halkanın gerçek doluluğu göstermesi ve %80'de turuncuya dönmesi.

**Adımlar ve beklenen:**
1. Yeni sohbette ilk cevaptan sonra halkanın üstüne gel.
   - Tooltip: "Context: X of Y tokens (P%)".
   - Y, agent'ın model context boyutuyla uyumlu (ör. 200K, 400K).
   - Bazı agent'larda halka ilk cevaptan sonra bile yüksek olabilir: sistem prompt'u ve tool tanımları da sayılır.
2. Prompt: `Read big.txt completely, all of it, and tell me how many lines it has.`
   - Cevap sürerken halka güncellenir; cevaptan sonra yüzde artmış olur.
3. %80'e gelene kadar context'i doldur. Gerekirse: `Read big.txt again in full and count how many times the word "symbol" appears.`
   - Halka turuncuya döner.
   - Tooltip'e ". The agent will soon compact the conversation." eklenir.
4. Sayfayı yenile.
   - Halka aynı yüzdeyi gösterir.

**Agent'a özel:** Halka agent'ın `usage_update` göndermesine bağlı. Hiç görünmüyorsa agent bunu göndermiyordur; ⚠️ yaz.

### 23. Compaction

**Ölç:** Konuşma sıkıştırıldığında sohbetin bozulmaması.

Bridge, ACP'nin compaction olaylarını almıyor; agent'a bu desteği bildirmiyor. Bu yüzden sıkıştırmanın nasıl göründüğü agent'a bağlı ve yalnızca gözlem olarak not edilir.

**Adımlar:**
1. Prompt: `Remember this code word for later: PELICAN-42. Just say OK.`
2. `/` yaz ve agent'ın menüdeki sıkıştırma komutunu kullan (`/compact`, `/compress` gibi). Menüde yoksa test 22'deki gibi context'i doldurup otomatik sıkıştırmayı bekle.
3. Prompt: `What was the code word I gave you?`

**Başarı ölçütü:**
- Komut çalışır, ardından sohbet hatasız devam eder; boş cevap ya da takılma yok.

**Gözlemler (not et, başarı ölçütü değil):**
- Sıkıştırma nasıl göründü? Claude bunu "Compact conversation" adımı olarak gösterebilir; diğerlerinde bir adım, mesaj ya da hiçbir şey.
- Halkanın yüzdesi sonraki cevapta düştü mü?
- Agent PELICAN-42'yi hatırladı mı?

---

## F. Resimler

### 24. Resim gönderme

**Ölç:** Resim eklemenin yalnızca resim okuyabilen agent'larda açık olması ve resmin agent'a doğru ulaşması.

**Adımlar ve beklenen:**
1. **Resim butonu** (Send'in solunda):
   - Agent resim okuyorsa buton var.
   - Okumuyorsa **buton hiç yok**. Bir resmi yapıştırınca ya da sürükleyince kutunun altında kırmızı "\<Agent\> does not read images." çıkar. Bu durumda testin geri kalanı N/A.
2. **Resmi ekle:** butonla, yapıştırarak (Cmd+V) ve sürükleyerek. Kutuda küçük önizleme görünür.
3. **Prompt:** `Describe this image in one sentence. What are the main colors?`
   - Agent içeriği doğru tarif eder.
   - Gönderilen resim mesaj balonunda görünür.
4. **Yalnızca resim gönder,** metin yazmadan.
   - Mesaj gider ve agent resme cevap verir.
5. **4 MB'a yakın bir resim gönder.**
   - Bağlantı kopmaz; cevap gelir ve "Processing request"te takılı kalmaz.

**Bilinen:** Codex ve Pi resim kabul ediyor; diğerlerini bu testte doğrula.

### 25. Resim alma

**Ölç:** Agent'ın ürettiği ya da gösterdiği resmin sohbette görünmesi.

**Prompt 1 (kaydedilen dosya):** `Draw a small bar chart of three made-up values as a PNG with any tool you have, save it, and show it to me here.`

**Beklenen:**
- Resim sohbet genişliğine sığacak şekilde görünür.
- Agent yolu `![...](/yol.png)` olarak da yazsa, link olarak da verse (Codex) resim gösterilir.
- Dosya 5 MB'tan büyükse:
  - Resim olarak yazıldıysa "Image: alt (dosya.png)" metni çıkar.
  - Link olarak yazıldıysa noktalı altı çizili metin olarak kalır.

**Prompt 2 (dosya linki):** `Write the text "hello" to /tmp/agent-test/hello.txt and give me a markdown link to that file.`

**Beklenen:**
- Link tıklanabilir bir console adresi olmaz; noktalı altı çizili metin olarak görünür.
- Üstüne gelince tam yol görünür.

**Prompt 3 (uzak resim):** `Show me the QuestDB logo as a markdown image from https://questdb.com/img/logo.png`

**Beklenen:** Resim yüklenmez; "Image: … (questdb.com)" linki görünür, tooltip "Not loaded automatically".

**Prompt 4 (ACP resim bloğu):** `Return a small PNG as an image attachment in your reply, not as a file path.`

**Beklenen:**
- Agent resmi ACP resim bloğu olarak gönderirse resim görünür.
- Blok 7 milyon karakteri aşarsa "*The agent sent an image too large to show here.*" çıkar.
- Agent bunu yapamıyorsa: N/A.

**Her durumda:** resim içeren cevaptan sonra yazılan mesajlarda arayüz takılmamalı.

---

## G. Komutlar ve akış

### 26. Slash komutları

**Adımlar ve beklenen:**
1. **`/` yaz.**
   - Önce console komutları gelir: `/model`, ve model effort'u destekliyorsa `/effort`. Ardından agent'ın kendi komutları.
   - Agent'ın kendi `/model` ve `/effort` komutları listede yoktur; yerlerinde console'unkiler var.
2. **Yazdıkça liste daralır.** Önce adı yazılanla başlayan komutlar gelir.
3. **Argüman ipucu olan bir agent komutu seç** (Codex'te `/review` gibi).
   - Menünün alt satırında "Enter to add \<argüman\> · Esc to close" yazar.
   - İlk Enter komutu tamamlar ve ipucu kartını gösterir; ikinci Enter gönderir.
4. **`/review`.** Değişiklik olan bir git deposunda çalıştır (ör. `trades.sql` içinde bir tırnağı sil).
   - Agent değişikliği inceler; bulgu bir kez görünür. İki kez görünürse ❌ yaz.
5. **Agent'ın bir bilgi komutu.** Menüde varsa `/status`; yoksa menüdeki benzer bir komut.
   - Çıktı sohbette okunur biçimde görünür.
6. **Menüde olmayan bir şey:** `/not-a-real-command`.
   - Normal mesaj olarak gider.

**Log:** komut normal bir tur gibi işlenir; `agent turn failed` olmamalı.

### 27. Steer

**Ölç:** Çalışan cevap durdurulup yeni mesaj gönderildiğinde agent'ın iptali zamanında işlemesi.

**Prompt:** `Run "sleep 20" in the shell, then say done.`

**Adımlar:**
1. Cevap sürerken `Stop that and say hi instead.` yaz ve Cmd/Ctrl+Enter'a bas (Send now).

**Beklenen:**
- Çalışan cevap durur; durdurulan cevapta hata satırı yok.
- Yeni mesaj normal bir cevap alır.
- "The agent is still answering the previous message." **görünmez**. Görünürse agent iptali geç işliyordur (5 saniyeden uzun): ⚠️ yaz.

**Log:** `agent turn failed` olmamalı.

### 28. Durdurma ve Retry

**Ölç:** Agent'ın iptali işlemesi; Retry'ın, gönderileni aynen yeniden göndermesi.

**Adımlar ve beklenen:**
1. **Durdurma:**
   - Prompt: `Read big.txt and count the occurrences of every distinct word, then print them sorted.`
   - Cevap sürerken Stop'a bas.
   - Tur durur ve "Operation has been cancelled" satırı ile Retry çıkar.
   - Hemen ardından `Reply with AFTER-STOP only.` gönder: cevap gelir; agent eski işi sürdürmez.
2. **Resimli Retry:** resim okuyan agent'ta.
   - Bir resim ekle ve `Describe the attached image in one sentence.` gönder; cevap sürerken Stop'a bas.
   - Retry'a bas: agent resmi yine görür ve tarif eder.
3. **Komutla Retry:**
   - Bir agent komutu gönder (ör. `/status`), cevap sürerken Stop'a bas, sonra Retry'a bas.
   - Komut yine komut olarak çalışır; normal bir mesaj gibi yorumlanmaz.

**Log:** Stop'ta agent süreci kapanmamalı (`agent process exited` yok).

**Not:** Stop, agent'ın o ana kadar yaptığı değişiklikleri geri almaz.

---

## H. QuestDB

### 29. QuestDB tool'ları ve notebook

**Ölç:**
- QuestDB tool'larının çalışması ve console adımlarıyla bir kez görünmesi.
- Notebook bağlamının agent'a ulaşması.
- Kullanıcı notebook'u değiştirdiyse agent'ın eski içeriğin üstüne yazmaması.

**Prompt 1:** `List the tables in QuestDB, then validate "SELECT FROM", then run SELECT count() FROM trades and tell me the results.`

**Beklenen:**
- Console'un kendi adımları görünür: "Reviewing tables", "Validating query" ve "Running query".
  - Geçersiz sorgu başarısız olarak işaretlenir ve sebebi görünür; sonraki adımlar çalışır.
  - "Running query" açılınca biçimlendirilmiş SQL ve "Copy query" butonu var.
- "Using agent tools" altında aynı çağrı için ikinci bir satır **yok**. Örnekler: `mcp__questdb_console__run_query`, `mcp.questdb_console.run_query`, `MCP: run_query`.
  - Bunu özellikle Gemini ve Copilot'ta kontrol et: tool adlandırmaları console'un tanıdığı kalıplarda olmayabilir.

**Prompt 2:** `Create a new notebook named "Agent test" with a SQL cell that shows the last 10 rows of trades, run it, and confirm with run_query that it returns 10 rows.`

**Beklenen:**
- Notebook oluşur ve hücre çalışır.
- Agent sonucu QuestDB tool'larıyla doğrular; ekran görüntüsü ya da tarayıcı kullanmaz.

**Prompt 3:** Hücreyi elle değiştir (ör. `LIMIT 10` → `LIMIT 5`), sonra yaz: `What did I just change in the notebook?`

**Beklenen:** Agent değişikliği bilir; notebook bağlamı ona ulaşmıştır.

**Prompt 4:** `Read the notebook, wait 20 seconds, then change the cell's query to select only the symbol column.` Agent beklerken hücreyi elle değiştir.

**Beklenen:**
- Agent'ın yazması "STATE_STALE: The user changed the notebook." ile reddedilir.
- Agent notebook'u yeniden okur ve senin değişikliğini ezmeden devam eder ya da sana sorar.

**Log:**
- `agent tool_call: <tool>` ve `tool_result: <tool> (Nms) ok`.
- Başarısızlıkta `failed: <sebep>` (WARN).

### 30. İzinlere tepki

**Ölç:** Agent'ın PERMISSION_DENIED aldığında kullanıcıya söylemesi ve tekrar denememesi. İzni console uygular; agent'a bağlı olan yalnızca tepkisi.

**Adımlar:** Alt çubuktaki "\<Agent\> connected" durumuna tıkla ve izinler bölümünde erişimi "Read data and schema (DQL)." seviyesine indir.

**Prompt:** `Create a table named agent_perm_test with one column x int.`

**Beklenen:**
- Tablo oluşmaz.
- Agent eksik izni kullanıcıya söyler ve aynı işlemi tekrar tekrar denemez.

**Log:** `tool_result: … failed: PERMISSION_DENIED …`, tek sefer.

---

## I. Oturum

### 31. Sayfa yenileme

**Adımlar:** Önceki testlerin yapıldığı sohbette sayfayı yenile.

**Beklenen:**
- Sohbet ve şunlar doğru çizilir:
  - soru kayıtları
  - bildirim notları
  - link kayıtları
  - resimler
  - adımlar ve diff'ler
- Prompt: `What was the first thing I asked you in this chat?`
  - Agent hatırlar.
  - Yenileme agent'ın oturumunu değiştirmez; kesin kanıt değildir, ama hatırlamazsa ⚠️ yaz.

### 32. Bridge yeniden başlatma

**Adımlar:**
1. Prompt: `Remember COPPER-17. Reply OK.`
2. Bridge'i Ctrl+C ile kapat, aynı komutla yeniden başlat ve yeniden eşleştir.
3. Aynı sohbette: `What code word did I give you?`

**Beklenen:**
- Agent COPPER-17 der: oturum `session/resume` ya da `session/load` ile devam etmiştir.
- Oturum yeniden açılamadıysa agent bilmez; geçmiş ekranda yine görünür. Bunu ⚠️ olarak not et.

**Log:**
- Kapanışta adım hatası yok.
- Yeniden başlarken `could not reopen agent session` görünüyorsa sebebini not et.

### 33. Bağlantı kopması

**Adımlar ve beklenen:**
1. **Kısa kopma.**
   - Uzun bir iş başlat: `Count from 1 to 3000, one number per line.`
   - Ağı 10 saniye kes ve geri getir. Sayfayı **yenileme**.
   - Cevap kaldığı yerden tamamlanır; arada gelen güncellemeler kaybolmaz.
2. **Uzun kopma.**
   - Aynı işi başlat ve ağı 30 saniyeden uzun kes.
   - Bridge turu iptal eder; console "Operation has been cancelled" ve Retry gösterir.
   - Yeni mesaj çalışır.
3. **Cevap sırasında sayfayı yenileme.**
   - Aynı işi başlat ve 10 saniye içinde sayfayı yenile.
   - Çalışan cevap yenilenen sayfada **devam etmez**; bu bilinen bir davranış.
   - Agent arka planda hâlâ çalışırken gönderilen mesaj "The agent is still answering the previous message." alabilir.
   - Agent işini bitirince mesajlar normal çalışır.

### 34. Model ve agent geçişleri

**Ölç:** Agent'ın görmediği önceki mesajların ona doğru aktarılması (`<earlier_conversation>`).

**Adımlar ve beklenen:**
1. **API modelinden agent'a.**
   - API key'li bir modelle: `Remember that my reference table is fx_trades. Say OK.`
   - Agent'a geç: `Which table did I name? Give only the table name.`
   - Cevap: fx_trades.
2. **Agent'tan API modeline ve geri.**
   - API modeline geç: `I now use market_data instead. Say OK.`
   - Agent'a dön: `Which table is current now?`
   - Cevap: market_data.
   - Agent'a yalnızca kendi son cevabından sonraki mesajlar gider; aynı mesaj iki kez gitmez.
3. **Agent'tan başka bir agent'a.**
   - Bridge'i `--agent <B>` ile yeniden başlat, eşleştir ve aynı sohbette sor: `Which table is current now?`
   - B de market_data der.

### 35. Birden çok sohbet

**Adımlar:** İki ayrı sohbet aç ve ikisinde ayrı işler yap.

**Beklenen:**
- Sohbetler birbirine karışmaz: her birinin kendi oturumu, notebook bağlamı ve context halkası var.
- Birinde iş sürerken diğerine geçmek o işi bozmaz. Arka plandaki cevabın tamamının kaydedildiğini dönüşte kontrol et.

**Agent'a özel (OpenCode):**
- Her sohbet ayrı bir süreç açar. İkinci sohbetin ilk mesajı daha geç cevap alabilir.
- Beş sohbet açınca en eski boştaki süreç kapanır. O sohbete dönüp mesaj gönderince oturum yeniden açılır.

**Log:**
- `starting agent: OpenCode` her yeni sohbette.
- Beşinci sohbette `stopped the idle agent process of conversation …`.

---

## Tek seferlik console kontrolleri

Agent'a göre değişmez. Bir kez, herhangi bir agent ile (resim kontrolleri için resim okuyan bir agent ile) test et.

- **Odak:** model ya da effort seçince, veya `/model` / `/effort` ile açılan seçici kapanınca odak mesaj kutusuna döner. Seçimsiz kapanışta seçicinin butonunda kalır.
- **Komut notları:**
  - "Model set to …", "Effort set to …" ve hata notları sohbet akışında çıkar.
  - Hatada yazılan metin kutuda kalır.
  - Sayfa yenilenince notlar kaybolur ve modele gönderilmezler.
- **Komut menüsü:**
  - Console komutunda alt satır: `/model` için "Enter to pick from the list · Tab to type a name", `/effort` için "… Tab to type a level".
  - ↑/↓ menüde döner, Tab tamamlar, Esc kapatır.
- **Kuyruk:**
  - Cevap sürerken yazılan mesaj "Queued" olarak bekler; × siler, boş kutuda ↑ düzenlemeye geri alır.
  - Cevap bitince gider. Stop kuyruktaki mesajı kutuya geri koyar.
- **Resim sınırları:**
  - Beş dosya birden seç: "A message takes up to 4 images."
  - 5 MB'tan büyük resim: "\<dosya\> is larger than 5 MB."
  - SVG/BMP: "Attach PNG, JPEG, GIF or WebP images."
  - Sürüklenen bir PDF sessizce yok sayılır. Tarayıcının PDF'i açıp console'dan çıkmadığını kontrol et.
  - Ekli resim varken API modeline geçince resim modele gönderilmez.
- **Kaydırma:**
  - Cevap akarken yukarı kaydırınca takip durur ve "Scroll to bottom" çıkar.
  - Butona ya da Cmd+↓ / Ctrl+End'e basınca sona döner.
- **Token sayacı:** API modeliyle cevap alınmış bir sohbette composer "Input/output tokens spent" sayacını gösterir. Yalnızca agent kullanılan sohbette bu sayaç yok.
- **Copy response:** ham markdown'ı kopyalar. Soru/bildirim kayıtları JSON blokları olarak, resimler `data:` adresi olarak gelir; bu bilinen bir durum.
- **Chart:** referans çizgisi ve heatmap (chart ayarlarından ve tool ile).

## Bilinen durumlar (test sırasında hata sayma)

- **Codex:**
  - Komut çıktısı yalnızca terminal referansı olarak gelir (test 11).
  - Resim aracının çıktısı 5 MB'ı geçebilir (test 25).
- **Gemini:** `ask_user` soruları kullanıcıya ulaşmıyor (test 18).
- **Copilot:** bu hesapta 403. Başka bir hesapla denenmeli.
- **Sayfa yenileme:** cevap sırasında yenileme çalışan cevabı console'da kaybettirir (test 33).
- **Stop:** soru kartını kapatınca geçmişte soru kaydı kalmaz (test 18).
- **Spinner:** agent soru beklerken son adımın spinner'ı dönmeye devam edebilir; bilinçli olarak bırakıldı.
- **Maliyet:** gösterilmiyor; agent'lar tutarsız raporluyor.
