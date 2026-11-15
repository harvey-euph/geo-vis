# Geo-Vis (Geographic Visualization)

Geo-Vis 是一套基於 **Next.js**、**MapLibre GL** 與 **FlatGeobuf (FGB)** 的高效能地理資訊視覺化系統。具備全球國家與多層級行政區（ADM0 / ADM1 / ADM2）階層下鑽、多種自訂地圖投影幾何變換、3D 真實宇宙星空背景，以及多區域 Union / Dissolve 拓撲合併等專業地理圖資功能。

---

## 🏛️ 系統模組化架構 (System Architecture)

為了保持系統的高可維護性、可讀性與測試便利性，前端應用已全面完成模組化拆分，將龐大的單一組件依功能職責細分至共用型別、圖層配置、客製 Hooks、展示元件與核心計算庫：

```text
src/
├── app/                              # Next.js App Router 頁面進入點
│   └── page.tsx
├── components/                       # UI 組件與地圖模組
│   ├── GeoVisApp.tsx                 # 主應用協調器 (Top-level Coordinator, ~580 行)
│   ├── TopNavigationBar.tsx          # 頂部控制列 (品牌、模式切換、下鑽路徑、國家搜尋)
│   ├── OptionsWindow.tsx             # 浮動選項彈窗 (投影法清單、星空開關、URL 複製)
│   ├── LeftHudInspector.tsx          # 左側 HUD (區域屬性、成員清單、頂點檢查、座標)
│   ├── RightDevSidebar.tsx           # 右側 Dev 面板 (Union 群組管理清單、預設範本)
│   ├── DevUnionToolbar.tsx           # 底部 Dev 工具列 (多選開關、頂點開關、三態循環)
│   ├── VertexTooltip.tsx             # 幾何頂點懸停資訊卡片與 JSON 複製 Toast
│   ├── hooks/                        # 功能性客製 React Hooks
│   │   ├── useMapSync.ts             # MapLibre 生命週期、事件綁定與 GPU 狀態同步
│   │   ├── useGeoData.ts             # FlatGeobuf 非同步載入、視窗邊界判定與階層快取
│   │   ├── useInteractiveLayers.ts   # 投影後 GeoJSON 構建與 Float64Array 空間命中索引
│   │   ├── useUnionManager.ts        # 多區域 Union 狀態機 (Separated / Grouped / Dissolved)
│   │   ├── useUrlState.ts            # URL 參數初始化、目標解析與無 %20 分享連結
│   │   ├── usePolygonVertices.ts     # 幾何頂點座標提取、內外環識別與異常跨度偵測
│   │   ├── useStarfieldRender.ts     # 3D 天球天體 Canvas 渲染迴圈 (RAF 60/120fps)
│   │   ├── useWindowDrag.ts          # 選項視窗 Pointer Capture 拖曳與碰撞遮擋偵測
│   │   └── useKeyboardShortcuts.ts   # 全域鍵盤快捷鍵 (ESC, P, T, U)
│   └── map/
│       └── map-layers.ts             # MapLibre Sources 與 Style Layers 宣告清單
├── lib/                              # 底層核心演算法與資料處理模組
│   ├── bbox-helper.ts                # 本土主大陸邊界校正、跨 180° 換日線與海外屬地最適化視角運算
│   ├── capital-manager.ts            # 全球國家首都 (Capital: ADM0 -> ADM1) 映射與專屬高亮配色管理
│   ├── fgb-loader.ts                 # FlatGeobuf 區塊串流載入與 Bounding Box 碰撞運算
│   ├── hierarchy-manager.ts          # 國家層級行政架構快取與下鑽層級展開演算法
│   ├── projections.ts                # 多投影座標正逆轉換 (Equal Earth, Natural Earth 等)
│   ├── spatial-index.ts              # O(1) 幾何邊界 Float64Array 射線檢測與命中測試
│   ├── starfield.ts                  # BSC5 / Hipparcos 真實星表天球映射與銀河星塵渲染
│   ├── target-resolver.ts            # URL 目標字串階層解析與底線/空白轉譯
│   └── union-engine.ts               # 多區域幾何消界 (Dissolve)、邏輯群組與調色盤管理
└── types/
    └── geovis.ts                     # 共用 TypeScript 介面、常數與輔助函式定義
```

---

## 🧩 模組功能詳細說明

### 1. 主協調元件 (`src/components/GeoVisApp.tsx`)
- 作為最頂層的協調中樞（Coordinator），負責組合所有專用 Hooks 並將狀態注入 UI 元件。
- 程式碼從原本近 5,000 行精簡至 500 多行，消除過去所有龐雜且混雜的副作用與樣式宣告。

### 2. 客製 Hooks 模組 (`src/components/hooks/`)
- **`useMapSync`**：
  - 封裝 MapLibre GL 實例建立、導航控制項、相機事件（`move`, `zoom`, `pitch`, `rotate`）。
  - 提供超高效能的 `mousemove` 檢測，結合 GPU `feature-state` 實現零延遲高亮與選取。
  - 處理點擊（單選、多選累加、背景點擊取消、頂點除錯複製）、雙擊直接下鑽。
  - 自動同步圖層資料來源 (`active-regions`, `context-adm0`, `polygon-vertices` 等)。
- **`useGeoData`**：
  - 自動並行載入 `metadata.json` 與基礎 `adm0.fgb` 圖資。
  - 依據當前視窗地理邊界 (`viewportGeoBbox`) 與縮放倍率，動態取得最近國家的 ADM1 / ADM2 分割資料。
  - 提供自動階層降級機制（若某國無 ADM2 則自動保持 ADM1，避免區域消失）。
  - 管理全域圖資快取與 `rawFeaturesById` 索引。
- **`useInteractiveLayers`**：
  - 將原始地理資料與 Union 群組結合，構建出互動圖資。
  - 將幾何圖資依當前投影法即時轉換為螢幕投影座標。
  - 建立 O(1) 的 `SpatialHitIndex`（Float64Array 記憶體緊湊佈局）以供滑鼠即時碰撞測試。
- **`useUnionManager`**：
  - 實作三態 Union 狀態機：
    1. **Separated (獨立)**：個別行政區保留各自邊界。
    2. **Grouped (邏輯群組)**：保留內部界線，但連動同組選取與高亮。
    3. **Dissolved (幾何消界)**：消除成員多邊形相鄰內界，融合成單一巨型多邊形。
  - 管理預設示範群組（如北歐五國 Scandinavia、比荷盧 Benelux、波羅的海等）。
- **`useUrlState`**：
  - 負責網址列參數的解析與初始化（`proj`, `lat`, `lon`, `ratio`, `target`, `dev`）。
  - 目標自動尋路與相機自動飛躍對齊（Auto-fit Bounding Box）。
  - 產生符合規範的分享網址（自動將空格轉化為 `_`，杜絕 `%20`）。
- **`usePolygonVertices`**：
  - 僅針對目前已選取的區域計算所有多邊形外環與內環頂點。
  - 進行經緯度鄰近點跨度分析，若發現 > 2° 之跳躍點自動標示異常警告。
- **`useStarfieldRender`**：
  - 獨立管理 3D 宇宙背景之 Canvas 渲染迴圈。
  - 依據裝置 DPR 自動縮放 Canvas 解析度。
  - 與 MapLibre 相機經緯度、方位角（Bearing）、俯仰角（Pitch）維持 60/120 FPS 嚴格同步。
- **`useWindowDrag`**：
  - 支援滑鼠/觸控指標捕捉（Pointer Capture），拖曳流暢無延遲。
  - 包含視窗防出界邊界限制與滑鼠碰撞遮蔽判斷（避免拖曳時意外觸發地圖圖層 Hover）。
- **`useKeyboardShortcuts`**：
  - 集中管理全域鍵盤熱鍵事件，確保輸入框獲得焦點時自動略過熱鍵。

### 3. UI 展示元件 (`src/components/`)
- **`TopNavigationBar`**：整合選項開關按鈕、互動模式選擇器（Local Hover / Wide Hover / Click / Zoom / Manual）、目前展開階層麵包屑中心，以及國家模糊搜尋下拉框。
- **`OptionsWindow`**：可拖曳懸浮視窗，包含五大投影法切換清單、3D 星空細項（恆星名稱、銀河星塵帶、大氣光暈）、拓撲工具開關與 URL 分享卡片。
- **`LeftHudInspector`**：顯示當前滑鼠懸停行政區名稱、ISO 代碼、所屬國家、成員清單、幾何頂點詳細屬性與游標即時經緯度。
- **`RightDevSidebar`**：提供開發者直覺管理所有已建立的 Union 目標，並可一鍵套用範本或解散群組。
- **`DevUnionToolbar`**：底部快捷操作列，整合多選模式開關、頂點圖層切換、自動拓撲修復開關，以及一鍵循環三態 Union 按鈕（快捷鍵 `U`）。
- **`VertexTooltip`**：滑鼠移入頂點時彈出浮動卡片，顯示 WGS84 座標、前點/後點跨度，點擊即可複製 JSON 除錯資料。

---

## 📌 URL 初始化參數規格 (URL Initialization)

Geo-Vis 支援從網址 URL Query Parameters 快速初始化投影法、視角座標、倍率與選取目標。

### 1. 投影模式 (`proj`)
設定地圖投影與渲染模式。

| ENUM 值 | 投影名稱 | 說明 |
| :--- | :--- | :--- |
| `globe` | **3D 地球 (3D Globe)** | **預設值**。真實三維球體視角，支援自轉、俯仰傾角與擬真宇宙星空背景。 |
| `equirectangular` | **等距圓柱投影 (Equirectangular)** | Plate Carrée。經線與緯線皆為平行直線，緯度間距相等，適合座標直接對照。 |
| `equalEarth` | **Equal Earth 等面積偽圓柱投影** | 保持全球各區域真實相對面積比例，高緯度陸地不變形放大（相容 `equal-earth`、`equal_earth`）。 |
| `naturalEarth` | **Natural Earth 自然地球投影** | 折衷偽圓柱投影，外觀圓潤平滑，形狀與面積呈現高度均衡（相容 `natural-earth`、`natural_earth`）。 |
| `mercator` | **Web Mercator 正軸等角圓柱投影** | 標準網路地圖等角投影，保持局部角度與方向正確。 |

---

### 2. 視角中心與縮放倍率 (`lat`, `lon`, `ratio`)
直接將地圖視角移動至指定經緯度與縮放倍率。

| 參數 | 類型 / 範圍 | 說明 |
| :--- | :--- | :--- |
| `lat` | 浮點數 (`-90` ~ `90`) | 緯度座標（Latitude） |
| `lon` | 浮點數 (`-180` ~ `180`) | 經度座標（Longitude，亦支援別名 `lng`） |
| `ratio` | 浮點數 (`0.8` ~ `14`) | 縮放倍率（Zoom Ratio，亦支援別名 `zoom`） |

- 若同時提供 `lat` 與 `lon`，系統會自動轉換至目前投影座標系並將鏡頭移動至指定座標。
- **初始化視角規則**：
  - **只有 `target`（無指定 `lat`/`lon`）**：相機會自動跳動並平滑縮放至該目標區域之邊界範圍（Bounding Box）。
  - **同時提供 `target` 與指定座標（`lat`、`lon`）**：系統會高亮選取該目標（Select Target），並將鏡頭精確移動至指定的經緯度與倍率（`ratio`）。

---

### 3. 目標行政區選取與定位 (`target`)
以階層式字串語法快速定位並高亮選取特定行政區，並自動將鏡頭平滑對焦至該區域範圍（Bounding Box）。

#### 語法格式
```text
target=ADM0[::ADM1][::ADM2]
```

> **重點規範：空白字元請以底線 `_` 取代**
> 為避免網址中出現難看的 `%20`，名稱中的空白字元 `' '` 需轉為 `'_'`（例如 `TWN::Hsinchu_County`）。Parser 在解析時會自動將 `_` 轉換對照至真實名稱，兩者皆能完美相容匹配。

- **第一層 (ADM0)**：國家 ISO3 代碼、國家英文名稱或 shapeID（如 `TWN`、`Taiwan`、`United_States`、`ADM0_TWN`，不分大小寫）。
- **第二層 (ADM1，選填)**：一級行政區名稱、slug 或 shapeID（如 `TWN::Hsinchu_County`、`USA::California`、`USA::New_York`）。
- **第三層 (ADM2，選填)**：二級行政區名稱、slug 或 shapeID（如 `TWN::Hsinchu_County::Zhubei_City`）。
- **跨層速查**：亦支援直接輸入 `target=TWN::Zhubei_City` 或 `target=TWN::::Zhubei_City`，系統將自動解析其所屬之上層 ADM1。
- **跨 180° 國際換日線與海外領土相機最適化對焦 (Mainland Landmass Auto-Fit)**：針對邊界跨越 180° 換日線或擁有極遠海外屬地的國家（如 `USA` 美國、`RUS` 俄羅斯、`FRA` 法國、`GBR` 英國、`NZL` 紐西蘭、`NOR` 挪威、`NLD` 荷蘭、`FJI` 斐濟等），系統會自動以本土主大陸（如美國本土 48 州 CONUS、法國本土 Hexagone）之最適邊界進行相機對焦，避免因少數極端極地外島或海外屬地導致鏡頭過度縮小（Zoom 1.0）或中心飄移至非洲／大西洋。
- **國家首都與首都所屬 ADM1 區域 (Capital & Enclosing Region) 專屬高亮**：當選取任一國家（ADM0，如點擊地圖或輸入 `target=TWN`、`target=USA`、`target=UGA`）時，系統會自動比對 `CAPITAL_MAP` 進行專屬琥珀金配色（`#d97706` 填色、`#fbbf24` 邊界線）高亮標示：
  - **首都本身即為 ADM1 者**：如台灣台北市（Taipei）、美國華盛頓特區（District of Columbia）、日本東京都（Tokyo）等，直接標記為 `★ 國家首都`。
  - **首都在圖資架構上隸屬於較大一級行政區者**：如**烏干達（Uganda）**首都坎帕拉（Kampala）隸屬於中部區（Central Region）、英國倫敦（London）隸屬於英格蘭（England）、加拿大渥太華（Ottawa）隸屬於安大略省（Ontario）等，系統在選取國家時會精準高亮標示**首都所屬之 ADM1 區域**（HUD 顯示 `★ 首都所屬區域 (首都: 坎帕拉 Kampala)`）；若下鑽至二級行政區（ADM2）時，則精準標示首都本體。

---

### 4. 開發者模式 (`dev`)
開啟進階拓撲控制、多邊形頂點檢視器（Polygon Points）、Union/Dissolve 循環工具列與手動除錯選項。

| 參數 | 值 | 說明 |
| :--- | :--- | :--- |
| `dev` | `true` 或 `1` | 開啟開發者模式（Dev Mode） |

---

### 5. URL 即時回寫功能 (Live URL State Writeback)

系統內建全自動 URL 即時雙向回寫機制（Live URL Writeback）：
- **座標與倍率即時回寫**：相機平移、縮放、旋轉或俯仰時，系統會自動將相機中心經緯度（轉換回 WGS84 未投影經緯度）與當前 Zoom 倍率即時回寫至網址列（`lat`、`lon`、`ratio`），並採用 300ms/100ms 防抖動（Debounce），避免頻繁觸發瀏覽器限制。
- **目標區域動態寫入**：當點擊選取任何國家（ADM0）、省/縣市（ADM1）或二級行政區（ADM2）時，網址列會自動同步更新為對應的階層式目標（例如 `target=TWN::Hsinchu_County`，空格一律轉換為 `_`，杜絕難看的 `%20`）。
- **取消選取自動清除**：點擊海面、再次點擊取消選取或按下 <kbd>ESC</kbd> 清除選取時，`target` 參數會自動從網址列移除，維持乾淨的視角座標網址。
- **投影與模式聯動**：切換投影法（如 Globe 轉 Equal Earth 等）或開發者模式時，網址參數同步即時連動。
- **零頁面刷新**：底層透過 `window.history.replaceState` 實現，完全不觸發 Next.js 頁面重新渲染或網路重載，操作極致流暢。

---

## ⌨️ 快捷鍵清單 (Keyboard Shortcuts)

在網頁任意處（未聚焦於輸入框時）可直接使用鍵盤快捷鍵進行高效操作：

| 快捷鍵 | 動作說明 | 作用範圍 |
| :--- | :--- | :--- |
| <kbd>ESC</kbd> | 若選項視窗開啟則優先關閉；否則**清除所有選取狀態與固定下鑽** | 全局 |
| <kbd>U</kbd> / <kbd>u</kbd> | **三態循環切換 Union 狀態**：`Grouped` $\rightarrow$ `Dissolved` $\rightarrow$ `Separated` | Dev 模式（選取 2 區以上） |
| <kbd>P</kbd> / <kbd>p</kbd> | **開關多邊形幾何頂點（Polygon Point）圖層** | Dev 模式 |
| <kbd>T</kbd> / <kbd>t</kbd> | **開關拓撲自動解結（Auto-Untangler / Auto-Fix Topology）** | Dev 模式 |
| <kbd>Shift</kbd> + 點擊 | **多選累加選取模式**，可直接複選多個行政區進行 Union 合併 | 全局 |

---

## 🔗 URL 範例 (Examples)

| 情境 | URL 範例 |
| :--- | :--- |
| **預設 3D 地球視角** | `http://localhost:8080/` |
| **切換至 Equal Earth 投影** | `http://localhost:8080/?proj=equalEarth` |
| **定位並選取台灣 (ADM0)** | `http://localhost:8080/?target=TWN` |
| **下鑽選取新竹縣 (ADM1，無 %20)** | `http://localhost:8080/?target=TWN::Hsinchu_County` |
| **下鑽選取竹北市 (ADM2，無 %20)** | `http://localhost:8080/?target=TWN::Hsinchu_County::Zhubei_City` |
| **指定經緯度座標與倍率** | `http://localhost:8080/?lat=25.0330&lon=121.5654&ratio=7.5` |
| **投影 + 選取目標 + 開發模式** | `http://localhost:8080/?proj=naturalEarth&target=TWN::Hsinchu_County&dev=true` |

---

## 🛠️ 開發與建置指令

### 啟動本機開發伺服器
```bash
npm run dev
```

### 檢查 TypeScript 型別
```bash
npx tsc --noEmit
```

### 生產環境靜態匯出建置 (`out/`)
```bash
npm run build
```

### Nginx 服務控制 (自建獨立 non-root 執行緒，支援 HTTP Range 與 CORS)
```bash
# 啟動 Nginx（若已啟動會自動重啟載入最新 out/ 靜態資源）
./scripts/nginx-cmd start
# 或使用 npm 指令：
npm run nginx:start

# 檢查 Nginx 運行狀態
./scripts/nginx-cmd status

# 停止 Nginx
./scripts/nginx-cmd stop
```
