# Geo-Vis 專案

## Basics

- Next.js 專案
- 地球呈現專案，使用 MapLibre，支援:
    - 平面地圖: 並且可以在不同投影方式切換模式，可先畫一版緯度等距的(我忘記這叫什麼投影法了)
    - 地球球體

- 給定上述地球投影方式，在上面描繪國家/行政區，資料來源全部使用 data/ 裡面提供的 geojson，可以思考一下要做什麼預處理，例如轉成 fgb 格式
- 要能 hover / click 區域
- 要能讓 hover / click 的 target 是多個區域的 union'
- 要依照縮放倍率切換 ADM level

## 前面都完成我再來繼續想