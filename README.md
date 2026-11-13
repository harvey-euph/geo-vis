# Geo-Vis (Geographic Visualization)

Geo-Vis 是一套基於 **Next.js**、**MapLibre GL** 與 **FlatGeobuf (FGB)** 的高效能地理資訊視覺化系統。具備全球國家與多層級行政區（ADM0 / ADM1 / ADM2）階層下鑽、多種自訂地圖投影幾何變換、3D 真實宇宙星空背景，以及多區域 Union / Dissolve 拓撲合併等專業地理圖資功能。

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

> **提示**：`proj` 參數不分大小寫，亦相容連字號（如 `equal-earth`）與底線（如 `equal_earth`）。

---

### 2. 視角中心與縮放倍率 (`lat`, `lon`, `ratio`)
直接將地圖視角移動至指定經緯度與縮放倍率。

| 參數 | 類型 / 範圍 | 說明 |
| :--- | :--- | :--- |
| `lat` | 浮點數 (`-90` ~ `90`) | 緯度座標（Latitude） |
| `lon` | 浮點數 (`-180` ~ `180`) | 經度座標（Longitude，亦支援別名 `lng`） |
| `ratio` | 浮點數 (`0.8` ~ `14`) | 縮放倍率（Zoom Ratio，亦支援別名 `zoom`） |

- 若同時提供 `lat` 與 `lon`，系統會自動轉換至目前投影座標系並將鏡頭置中。
- 若同時指定 `target` 與 `lat`/`lon`，將優先依據使用者指定之 `lat`/`lon` 定位視角。

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

---

### 4. 開發者模式 (`dev`)
開啟進階拓撲控制、多邊形頂點檢視器（Polygon Points）、Union/Dissolve 循環工具列與手動除錯選項。

| 參數 | 值 | 說明 |
| :--- | :--- | :--- |
| `dev` | `true` 或 `1` | 開啟開發者模式（Dev Mode） |

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
