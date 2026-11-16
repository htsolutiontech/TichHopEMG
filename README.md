# Vườn học nhỏ POC phiên bản 2

Phiên bản này dùng **Google Sheets + Google Apps Script** cho toàn bộ dữ liệu tài khoản, phiên đăng nhập, phân quyền, hồ sơ bé, kết quả học và nhật ký. Không cần Firebase, cơ sở dữ liệu ngoài hoặc dịch vụ xác thực bên thứ ba.

Giữ nguyên 70 buổi lớp Lá, thẻ minh họa, đọc âm thanh, trò chơi tìm cặp, bài tập 5 câu, điểm đạt 80/100 để mở buổi sau, nhật ký cha mẹ và xuất CSV. Lớp 1–5 vẫn ở trạng thái chờ giáo án. Giáo án là tài liệu tham khảo độc lập, chưa được EMG xác nhận.

## Chạy thử giao diện ngay

Giải nén toàn bộ ZIP. Máy Windows cần Python 3, sau đó nhấp đúp **RUN_TEST_WINDOWS.bat**, mở `http://127.0.0.1:8765/` và bấm **Khám phá bản trải nghiệm**. Không mở index.html trực tiếp bằng file://. Bản trải nghiệm dùng dữ liệu minh họa trên trình duyệt, chưa ghi vào Google Sheet. Cấu hình các bước dưới đây để thử tài khoản thật và lưu dữ liệu.

## 1 Tạo Sheet và Apps Script

1. Tạo Google Spreadsheet **riêng tư**. Không bật Publish to web, không chia sẻ link cho cha mẹ hoặc trẻ. Chỉ chủ vận hành được chỉnh Sheet.
2. Mở Extensions → Apps Script. Thêm đủ ba tệp `Code.gs`, `Auth.gs`, `Seed.gs` trong thư mục `apps-script`.
3. Bật hiển thị manifest và thay `appsscript.json` bằng tệp trong gói. Phạm vi quyền: đọc/ghi Sheets, gửi email bằng tài khoản triển khai, tạo trigger bảo trì. Không cần UrlFetch hoặc Firebase.
4. Trong Project Settings → Script Properties, thêm:

| Thuộc tính | Giá trị |
|---|---|
| SPREADSHEET_ID | ID Sheet vừa tạo, bắt buộc |
| ADMIN_EMAIL | Email cha mẹ sẽ được cấp admin sau khi đăng ký và xác minh |
| DAILY_MAIL_LIMIT | Tùy chọn, mặc định 50 email/ngày, vẫn phụ thuộc quota Google |
| DAILY_REGISTER_LIMIT | Tùy chọn, mặc định 50 lượt đăng ký mới/ngày |

5. Chạy **setup()** rồi cấp quyền. Script tự tạo bảng còn thiếu, giữ dữ liệu đã có và tạo AUTH_SECRET một lần. Nếu header hiện tại không khớp, script dừng, không tự ghi đè bảng đó.
6. **Sao lưu AUTH_SECRET ở nơi riêng tư**, cùng Sheet và script. Không đưa vào ZIP, repo hoặc config.js. Không đổi hoặc xóa AUTH_SECRET sau khi có tài khoản; nó được dùng bảo vệ thông tin xác thực. Đổi secret sẽ làm tài khoản cũ không thể đăng nhập/xác minh theo cấu hình cũ.
7. Chạy **installRetentionTrigger()**. Mỗi ngày script xóa nhật ký quá 90 ngày và phiên đăng nhập hết hạn.

## 2 Xuất bản Web App

Deploy → New deployment → Web app:

- Execute as: **Me**.
- Who has access: **Anyone**.

Endpoint được gọi công khai, nhưng từng thao tác riêng tư đều kiểm tra token, tài khoản, vai trò và quyền sở hữu ở máy chủ. Email xác minh do tài khoản Google triển khai gửi bằng MailApp. Nếu chính sách Workspace chặn Web App công khai hoặc quyền gửi email, cần quản trị viên xử lý; không công khai Sheet để vượt hạn chế.

Sao chép URL kết thúc bằng **/exec**, không dùng /dev. Khi sửa code Apps Script: Manage deployments → Edit → New version → Deploy, giữ endpoint cũ nếu có thể.

## 3 Cấu hình ứng dụng

Chỉ cần sửa **config.js**:

```js
window.APP_CONFIG = {
  apiUrl: 'https://script.google.com/macros/s/DEPLOYMENT_ID/exec'
};
```

Không có API key Firebase. Không đưa ID Sheet, AUTH_SECRET, email admin, mật khẩu hoặc token vào frontend. Frontend chạy trên localhost để test hoặc GitHub Pages bằng HTTPS. Trình duyệt cần WebCrypto để xử lý mật khẩu; mở bằng HTTP trên IP LAN sẽ không được hỗ trợ đăng nhập.

## 4 Tạo tài khoản cha mẹ và admin

1. Cha mẹ tự đăng ký email, mật khẩu từ 12–128 ký tự, đồng ý lưu dữ liệu POC.
2. Apps Script gửi mã 6 số qua email, có hiệu lực 15 phút; nhập mã trong cửa sổ xác minh. Kiểm tra thư rác nếu cần.
3. Đăng nhập sau khi xác minh. Tạo hồ sơ bé bằng biệt danh, mở góc học cho bé.
4. Muốn cấp admin, điền email tài khoản **đã xác minh** vào Script Property ADMIN_EMAIL rồi chạy **syncAdmin()** trong trình soạn Apps Script. Tài khoản tự đăng ký luôn là parent; không có mật khẩu admin mặc định.
5. Để gỡ quyền admin, đặt TARGET_EMAIL và chạy **removeAdmin()**. Để khóa tài khoản, đặt TARGET_EMAIL và chạy **disableAccount()**. Các hàm này chỉ dành cho chủ script, không được gọi qua API Web App.

## 5 Phân quyền

| Vai trò | Quyền |
|---|---|
| parent | Đọc hồ sơ/kết quả con của mình, thêm/xóa hồ sơ, mở phiên học của con, xuất nhật ký CSV |
| child | Chỉ đọc hồ sơ hiện tại, học buổi đã mở, làm bài và nhận kết quả của chính bé; không thêm/xóa hồ sơ hoặc xem admin |
| admin | Quyền của parent với con mình, thêm thống kê toàn hệ thống và nhật ký truy cập |
| operator | Chủ Apps Script: cấp/gỡ admin, khóa tài khoản, xuất bản học liệu trong trình soạn script |

Vai trò luôn được kiểm tra tại máy chủ. Gửi role/admin/parentUid/score giả từ trình duyệt không cấp thêm quyền. Admin chỉ xem tổng hợp/nhật ký toàn hệ thống; giao diện gia đình vẫn chỉ hiển thị con của chính admin.

Mở phiên bé sẽ **thu hồi phiên cha mẹ hiện tại** và cấp token riêng cho bé. Quay lại góc cha mẹ phải đăng nhập lại. Phiên cha mẹ/bé tối đa một giờ; token thô chỉ nằm ở sessionStorage của tab. Sheet chỉ lưu SHA-256 của token. Đăng xuất thu hồi token máy chủ; reset mật khẩu thu hồi mọi phiên của tài khoản. Khóa tài khoản và xóa hồ sơ làm phiên liên quan mất quyền.

## 6 Quên mật khẩu

Điền email ở màn hình đăng nhập, chọn Quên mật khẩu, nhận mã email rồi nhập mã và mật khẩu mới. Mã một lần, hiệu lực 15 phút, tối đa 5 lần nhập sai. Gửi lại mã phải chờ ít nhất một phút. Sau reset cần đăng nhập lại.

Nếu gửi email lỗi sau khi đăng ký, tài khoản có thể đang pending; dùng nút **Xác minh email / Gửi lại mã** khi quota/kết nối đã hồi phục. Không đăng ký lại để ghi đè mật khẩu.

## 7 Các bảng dữ liệu

| Sheet | Dữ liệu |
|---|---|
| Users | Email cha mẹ, UID, verifier mật khẩu, vai trò, trạng thái, thông tin kiểm soát OTP và khóa tạm |
| Sessions | Hash token, UID, loại phiên, ID bé nếu có, thời gian hết hạn |
| Parents | UID, ngày tạo, phiên bản đồng ý |
| Children | ID bé, UID cha mẹ, biệt danh, lớp |
| Attempts | Mã đề, ID bé/buổi, điểm máy chủ, thời gian, phiên bản học liệu |
| Audit | UID, thời gian, loại thao tác, tham chiếu; không mật khẩu, proof, OTP hoặc token |
| Curriculum | JSON giáo án chia đoạn, phiên bản |

Email và biệt danh là văn bản trong Sheet riêng tư; **không có mã hóa từng trường bằng khóa riêng của ứng dụng**. Google quản lý bảo vệ/mã hóa ở tầng dịch vụ. Không thu âm, ảnh, vị trí hay dữ liệu sức khỏe trẻ.

## 8 Cách bảo vệ mật khẩu

Trình duyệt dùng WebCrypto PBKDF2-HMAC-SHA256 với 600.000 vòng và salt riêng theo email do máy chủ cấp, tạo proof 32 byte. Proof đi qua HTTPS tới Apps Script; server lưu HMAC-SHA256(proof gắn email) với pepper AUTH_SECRET trong Script Properties. Sheet không lưu mật khẩu thô, proof, mã email thô hoặc token thô.

**Proof là thông tin xác thực tương đương mật khẩu**: không ghi log hoặc chia sẻ payload đăng nhập. PBKDF2 được thực hiện phía client; backend không tự chạy lại thuật toán này và không thể đánh giá độ mạnh mật khẩu gốc. Chính sách chiều dài mật khẩu được giao diện thực thi. Đây là thiết kế POC, không phải tuyên bố đã được kiểm toán bảo mật hay tương đương một dịch vụ identity được quản lý.

Các lần sai mật khẩu khóa tài khoản 15 phút sau 5 lần; mã OTP có tối đa 5 lần thử. Cache rate limit và hạn mức đăng ký/email chỉ giảm lạm dụng trong POC, không thay thế chống DDoS/WAF. Chủ dự án cần theo dõi quota và log trước khi mời gia đình dùng thật. GitHub Pages theo đường dẫn dùng chung origin với các site khác cùng tài khoản; dùng domain riêng khi triển khai chính thức để tách origin.

## 9 Giữ dữ liệu cũ và cập nhật học liệu

setup() không xóa Users, Parents, Children, Attempts hoặc Audit đã có. Không tự chuyển danh tính từ bản Firebase: nếu bản cũ đã có dữ liệu thật, sao lưu rồi lập ánh xạ UID cũ→UID tài khoản mới có kiểm chứng trước khi đổi parentUid. Không chạy thay thế trên dữ liệu thật khi chưa xác nhận ánh xạ. Bản v2 đóng gói để anh test riêng trước, chưa cập nhật repo hoặc triển khai ghi đè bản trước.

Cập nhật `data/curriculum.json`, giữ ID/thứ tự bài, tăng version, chạy `python tools_seed.py`, cập nhật Seed.gs và chạy publishCurriculum(). Lớp 1–5 cần nội dung được duyệt và cập nhật chọn lớp/mở khóa tương ứng, như thiết kế bản đầu.

## 10 Kiểm thử và triển khai Pages

```text
node --check app.js
node tests/backend.test.cjs
node tests/client-auth.test.cjs
```

Bộ kiểm thử mô phỏng Apps Script đã xác nhận đăng ký, xác minh, đăng nhập, reset, phiên, RBAC, quyền sở hữu và chấm điểm. **Chưa có Sheet/Web App thực tế của anh để kiểm thử tích hợp**. Cần thử đủ email xác minh/reset, redirect/CORS từ Pages, quyền MailApp, quyền Sheet, hai gia đình độc lập và admin trước khi dùng thật. Nếu /exec trả trang HTML thay vì JSON, kiểm tra loại deployment, URL /exec, access Anyone và phiên bản triển khai.

Workflow Pages vẫn có trong gói. Sau khi anh test xong, chép mã nguồn vào repo, bật Settings → Pages → GitHub Actions và chạy workflow. Bản ZIP này không tự đẩy thay đổi lên repo.

Nguồn kỹ thuật: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html và https://developers.google.com/apps-script/reference/utilities/utilities . Việc dùng PBKDF2 không đồng nghĩa toàn bộ kiến trúc đã được OWASP xác nhận.
