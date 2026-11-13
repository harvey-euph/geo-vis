# Geo-Vis 專案

- [x] 支援 URL 初始化
    - [x] dev mode (dev=true)
    - [x] 經緯度座標置中及縮放倍率調整 (lat={}&lon={}&ratio={})
    - [x] selected 狀態 (target={})，找出好的方式可以定位任意 ADM{1,2,3}，應該可以用 ADM0[::ADM1][::ADM2] 的方式快速定位（空白轉 '_' 如 TWN::Hsinchu_County，避免 %20）
    - [x] 投影模式 (proj={}: 列出 ENUM 寫在 README.md)
