# Kết quả kiểm thử bản v2

## PASS trên môi trường mô phỏng

- 44 kiểm tra backend: đăng ký có đồng ý, không tự cấp admin, email verification, OTP sai/hết hạn/hết lượt, chống ghi đè tài khoản đã có, login, password reset, thu hồi phiên, khóa đăng nhập, quyền sở hữu, phiên riêng của bé, admin/operator, bảo vệ điểm và mở khóa bài, xóa hồ sơ, hạn chế cấp lớp chưa có nội dung.
- 3 kiểm tra client auth: proof tạo bằng WebCrypto khớp PBKDF2 tham chiếu Node; từ chối cấu hình KDF yếu hơn; dừng khi không có WebCrypto.
- JavaScript frontend, Code.gs và Auth.gs qua kiểm tra cú pháp.
- data/curriculum.json và Seed.gs giữ nguyên nội dung so với bản v1; 70 buổi, 85 mục từ. CSS/giao diện học tập giữ nguyên.

## Giới hạn xác minh

Chưa có Google Sheet, deployment /exec và quyền MailApp của người dùng để chạy tích hợp thực tế. Kiểm tra mô phỏng không xác nhận CORS/redirect, quota, quyền Workspace, việc nhận email thật, cách Google Sheets ghi/đọc từng trường hoặc chất lượng giọng đọc trên điện thoại.

## Checklist trước khi dùng dữ liệu thật

1. setup() chạy thành công, Sheet không public, AUTH_SECRET đã sao lưu riêng tư.
2. Deploy Web App Execute as Me, access Anyone; config.js trỏ đúng /exec phiên bản mới.
3. Đăng ký bằng hai email thật được kiểm soát; xác minh, đăng nhập, gửi lại mã, reset; xác nhận Sheet không có mật khẩu thô, proof, OTP thô hoặc token thô.
4. Mỗi cha mẹ tạo một bé. Kiểm tra không truy cập/xóa hồ sơ người khác; bé không gọi admin; phiên cha mẹ cũ bị thu hồi khi mở phiên bé.
5. 3/5 không mở buổi sau, 4/5 mở; không nhận điểm do client tự gửi; nộp lại mã đề bị chặn.
6. Cấp admin bằng syncAdmin() và thử nhật ký. Gỡ quyền/khóa tài khoản thì phiên cũ mất quyền.
7. Kết quả đọc lại được sau đăng nhập thiết bị khác; logout/reset/xóa hồ sơ có hiệu lực.
8. Kiểm tra trigger dọn audit/phiên, email quota, thông tin liên hệ vận hành và quy trình xóa tài khoản.

## Cách chạy lại

```text
node --check app.js
node --check < apps-script/Code.gs
node --check < apps-script/Auth.gs
node tests/backend.test.cjs
node tests/client-auth.test.cjs
```

Hai lệnh có dấu `<` dùng terminal có hỗ trợ input redirection. Chạy bộ kiểm thử cần Node.js; chạy giao diện trên Windows chỉ cần Python 3 và trình duyệt hiện đại.
