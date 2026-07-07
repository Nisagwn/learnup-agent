# ⛔ BU KLASÖRDEN CLOUD FUNCTIONS DEPLOY ETME

Canlı backend (Cloud Functions, ~29 fonksiyon) **tek otorite olan AYRI bir mobil repodan**
yönetilir ve **yalnızca oradan** deploy edilir.

## Neden?
Bu web reposundaki `functions/` klasörü canlı backend'in **tam/güncel kopyası DEĞİLDİR**
(ör. üretim-sonrası verifier mantığı burada yoktur). Buradan `firebase deploy --only functions`
çalıştırmak, mobil repoda var olup burada **bulunmayan** fonksiyonları **canlıdan SİLER** ve
mevcutları eski sürümle **üzerine yazar**. Bu, üretimi bozar.

## Kalıcı korumalar
- `firebase.json` içinden **`functions` bloğu kaldırıldı** → `firebase deploy` bu repodan
  fonksiyonlara hiç dokunamaz (yalnız Hosting/Firestore deploy eder).
- `functions/package.json` → `deploy` script'i **reddedecek** şekilde değiştirildi.

## Bu klasör ne işe yarar?
Yalnızca **yerel referans / emülatör** içindir (web'in çağırdığı sözleşmeyi okumak,
prompt'a bakmak vb.). Backend davranışını değiştirmen gerekirse **mobil repoda** yap ve
oradan deploy et.

## Web nasıl çalışıyor?
Web frontend, backend'i yalnızca **çağırır** (`https://us-central1-<project>.cloudfunctions.net/...`).
Bu URL değişmez. Frontend deploy'u (`npm run build` + Hosting) bundan **bağımsızdır** ve
güvenle yapılabilir.
