# Resolution Increaser

Tarayıcıda çalışan fotoğraf çözünürlüğü yükseltici — [UpscalerJS](https://upscalerjs.com) + TensorFlow.js ile 2× ve 4× upscale. Fotoğraf cihazından çıkmaz: sunucu yok, yükleme yok, gizlilik varsayılan.

## Özellikler

- **2× / 4× upscale** — [ESRGAN-slim](https://github.com/upscalerjs/esrgan-slim) modelleri tarayıcı içinde çalışır
- **Tamamen offline** — modeller repodan yüklenir, fotoğraf hiçbir yere gönderilmez
- **Sürükle-bırak** arayüzü ve ölçek seçici
- **Öncesi/sonrası karşılaştırma** slider'ı ile sonucu piksel piksel inceleme
- WebGPU varsa donanımsal hızlandırma, yoksa WASM backend'e otomatik düşüş

## Nasıl çalışır

Tarayıcıda [TensorFlow.js](https://www.tensorflow.org/js) çalıştırılan ESRGAN süper-çözünürlük modelleri ile görüntü tensor'ları büyütülür. Tüm hesaplama istekteki cihazda yapılır; bu yüzden fotoğrafınız internette dolaşmaz.

## Kurulum

```bash
npm install
npm run dev       # geliştirme sunucusu
npm run build     # tsc kontrolü + üretim derlemesi
npm run preview   # derlemeyi yerelde önizle
```

## Proje yapısı

```
src/
  main.ts               # giriş noktası
  upscaler/             # model yükleme ve backend (webgpu/wasm) seçimi
  ui/                   # dropzone, ölçek seçici, karşılaştırma slider'ı, ilerleme
  util/                 # görüntü ve DOM yardımcıları
public/
  models/               # x2 / x4 ESRGAN-slim model dosyaları (tfjs formatı)
```
