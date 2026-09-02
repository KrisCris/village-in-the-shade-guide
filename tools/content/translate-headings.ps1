param(
  [string]$OutputPath = 'data/sources/guide-translations.json',
  [int]$BatchSize = 10,
  [switch]$Refresh
)

$ErrorActionPreference = 'Stop'
$catalog = Get-Content -Raw 'data/sources/appmedia-honogurashi.json' | ConvertFrom-Json
$outlines = Get-Content -Raw 'data/sources/appmedia-outlines.json' | ConvertFrom-Json
$texts = @($catalog.sources.title) + @($outlines.outlines.headings)
$texts = @($texts | Where-Object { $_ } | Sort-Object -Unique)

$translations = [ordered]@{}
if (-not $Refresh -and (Test-Path -LiteralPath $OutputPath)) {
  $existing = Get-Content -Raw -LiteralPath $OutputPath | ConvertFrom-Json -AsHashtable
  foreach ($key in $existing.Keys) { $translations[$key] = $existing[$key] }
}

$terms = [ordered]@{
  'ほの暮しの庭' = '静谧田园'; 'あんしん暮し' = '安心生活'; 'ほの暮し' = '静谧生活'
  'カシミヤヤギ' = '开司米山羊'; 'カラーヒヨコ' = '彩色小鸡'; '付喪達磨' = '付丧达摩'
  'シロージ' = '四郎治'; 'サザンカ' = '茶梅'; 'ロッカク' = '六角'; 'コンノ' = '今野'
  'コマコ' = '驹子'; 'キスケ' = '木助'; 'ユータ' = '裕太'; 'ハスミ' = '莲实'
  'スミレ' = '堇怜'; 'トバリ' = '帷'; 'チナナ' = '琪娜娜'; 'リン' = '林'; 'ヨウ' = '洋'; 'ナゴ' = '名护'
  'ヌシ' = '主宰'; '勾玉' = '勾玉'; '玉手箱' = '玉手箱'; 'ムコウ辻' = '彼方路口'; '兵糧丸' = '兵粮丸'
  'スプリンクラー' = '洒水器'; 'スタミナ' = '体力'; 'ストーリー' = '剧情'; 'エンディング' = '结局'
  'プレゼント' = '礼物'; 'アイテム' = '物品'; 'スキル' = '技能'; 'レシピ' = '配方'; 'ボス' = '首领'
  'ツルハシ' = '镐'; 'ジョウロ' = '洒水壶'; 'オノ' = '斧头'; 'カギ' = '钥匙'
  '牛お化け' = '牛怪'; '提灯お化け' = '灯笼怪'; '唐傘お化け' = '唐伞怪'; '風神雷神' = '风神雷神'
  '雪女' = '雪女'; '天狗' = '天狗'; '百目' = '百目'; '野槌' = '野槌'; '鵺' = '鵺'
  'ウマ' = '马'; '雄鶏' = '公鸡'; '掟の五' = '戒律五'; '掟の六' = '戒律六'; '掟の七' = '戒律七'
}
$characterTerms = @('シロージ', 'サザンカ', 'ロッカク', 'コンノ', 'コマコ', 'キスケ', 'ユータ', 'ハスミ', 'スミレ', 'トバリ', 'チナナ', 'リン', 'ヨウ', 'ナゴ')

function Protect-Text([string]$text) {
  $protected = $text
  $restores = [ordered]@{}
  $index = 0
  foreach ($entry in $terms.GetEnumerator()) {
    $isCharacter = $characterTerms -contains $entry.Key
    $pattern = if ($isCharacter) { [regex]::Escape($entry.Key) + '(?=の|と|に|が|を|へ|から|で|も|、|・|$)' } else { [regex]::Escape($entry.Key) }
    if ([regex]::IsMatch($protected, $pattern)) {
      $token = "[VITS$index]"
      $protected = [regex]::Replace($protected, $pattern, $token)
      $restores[$token] = $entry.Value
      $index++
    }
  }
  return @{ Text = $protected; Restores = $restores }
}

function Normalize-Chinese([string]$text) {
  $result = $text.Trim()
  $result = $result -replace '(?<=[一-龥])\s+(?=[一-龥])', ''
  return $result.Replace('上半年', '上半').Replace('下半年', '下半').Replace('策略图', '攻略流程').Replace('建议的财务措施', '推荐赚钱方法')
}

function Restore-Text([string]$text, $restores) {
  $result = $text.Trim()
  foreach ($entry in $restores.GetEnumerator()) {
    $tokenNumber = $entry.Key.Replace('[VITS', '').Replace(']', '')
    $result = $result -replace "[【\[]\s*VITS$tokenNumber\s*[】\]]", $entry.Value
  }
  return Normalize-Chinese $result.Replace('“', '「').Replace('”', '」').Replace('！', '')
}

function Request-Translation([string]$payload) {
  $body = @{ client = 'gtx'; sl = 'ja'; tl = 'zh-CN'; dt = 't'; q = $payload }
  for ($attempt = 1; $attempt -le 3; $attempt++) {
    try {
      return Invoke-RestMethod -Method Post -ContentType 'application/x-www-form-urlencoded; charset=UTF-8' -Body $body -TimeoutSec 45 -Uri 'https://translate.googleapis.com/translate_a/single'
    } catch {
      if ($attempt -eq 3) { throw }
      Start-Sleep -Seconds $attempt
    }
  }
}

function Has-Untranslated-Latin([string]$text) {
  $allowedRemoved = $text -replace '(?i)Steam|Switch|Windows|PlayStation|PS\d|Nippon|Nintendo|Xbox|No\.|Ver\.|TOP|DLC|PC|URL|SNS|jp', ''
  return $allowedRemoved -match '[A-Za-z]{2,}'
}

function Save-Translations {
  $parent = Split-Path -Parent $OutputPath
  if ($parent) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
  $translations | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath $OutputPath -Encoding utf8
}

$pending = @($texts | Where-Object { -not $translations.Contains($_) })
$delimiter = '⟦VITS_SPLIT⟧'
for ($offset = 0; $offset -lt $pending.Count; $offset += $BatchSize) {
  $end = [Math]::Min($offset + $BatchSize - 1, $pending.Count - 1)
  $batch = @($pending[$offset..$end])
  $protectedRows = @($batch | ForEach-Object { Protect-Text $_ })
  $payload = ($protectedRows.Text -join "`n$delimiter`n")
  $response = Request-Translation $payload
  $joined = (($response[0] | ForEach-Object { $_[0] }) -join '')
  $translatedRows = @($joined -split [regex]::Escape($delimiter))
  if ($translatedRows.Count -ne $batch.Count) { throw "Translation batch mismatch at ${offset}: expected $($batch.Count), got $($translatedRows.Count)" }
  for ($i = 0; $i -lt $batch.Count; $i++) {
    $translations[$batch[$i]] = Restore-Text $translatedRows[$i] $protectedRows[$i].Restores
  }
  Save-Translations
  Write-Host "translated $($end + 1)/$($pending.Count)"
  Start-Sleep -Milliseconds 120
}

foreach ($key in @($translations.Keys)) { $translations[$key] = Normalize-Chinese $translations[$key] }
$residualKeys = @($translations.Keys | Where-Object { $translations[$_] -match '[ぁ-ゖァ-ヺ]' -or $translations[$_] -match 'VITS\d+' -or (Has-Untranslated-Latin $translations[$_]) })
foreach ($key in $residualKeys) {
  $protectedRow = Protect-Text $key
  $response = Request-Translation $protectedRow.Text
  $translated = (($response[0] | ForEach-Object { $_[0] }) -join '')
  $translations[$key] = Restore-Text $translated $protectedRow.Restores
  Save-Translations
}
$remaining = @($translations.Keys | Where-Object { $translations[$_] -match '[ぁ-ゖァ-ヺ]' -or $translations[$_] -match 'VITS\d+' -or (Has-Untranslated-Latin $translations[$_]) })
if ($remaining.Count) { throw "Untranslated guide strings remain: $($remaining -join ', ')" }

Save-Translations
Write-Host "guide translations=$($translations.Count)"
