# Thiết kế Vườn học nhỏ POC phiên bản 2

Phiên bản 2 thay phần xác thực Firebase bằng Apps Script và Google Sheets. Các tính năng học giữ nguyên: 70 buổi lớp Lá 5–6 tuổi, 85 mục từ có hình/biểu tượng, giọng đọc hệ thống, nghe câu mẫu, nghe tiến trình giáo án, trò chơi tìm cặp, bài tập 5 câu, ngưỡng 80/100, nhật ký cha mẹ và xuất CSV. Nội dung là tham khảo độc lập, chưa được EMG xác nhận.

## Thành phần

- Frontend HTML/CSS/JS chạy trên localhost hoặc GitHub Pages HTTPS. config.js chỉ có apiUrl /exec.
- Apps Script xử lý đăng ký, OTP email, đăng nhập, khôi phục mật khẩu, phiên, RBAC, tạo/xóa hồ sơ, chấm điểm và nhật ký.
- Google Sheets riêng tư chứa Users, Sessions, Parents, Children, Attempts, Audit, Curriculum. MailApp gửi mã từ tài khoản Google triển khai.
- Không có Firebase, tài khoản dịch vụ ngoài, database ngoài hoặc phụ thuộc npm.

## Người dùng và luồng

| Vai trò | Quyền |
|---|---|
| Cha mẹ | Đăng ký email/mật khẩu, xác minh email, reset mật khẩu, tối đa 5 hồ sơ con, xem nhật ký và xuất CSV, xóa hồ sơ/kết quả của con |
| Bé | Hồ sơ riêng do cha mẹ mở, chỉ xem/học/làm bài cho chính bé; không quản lý tài khoản hoặc xem nhật ký toàn hệ thống |
| Admin | Quyền cha mẹ với con của mình, xem thống kê toàn hệ thống và 200 sự kiện gần nhất |
| Chủ script | Cấp/gỡ admin, khóa tài khoản, xuất bản giáo án từ trình soạn Apps Script |

Quyền được kiểm tra trên máy chủ theo Users và Sessions. Client không được tự chọn role hoặc UID chủ sở hữu. Tự đăng ký luôn là parent pending, chưa hoạt động cho đến khi xác minh email. Admin phải được chủ script cấp qua syncAdmin().

Khi cha mẹ mở hồ sơ bé, phiên cha mẹ hiện tại bị thu hồi và thay bằng phiên bé. Quay lại góc cha mẹ phải đăng nhập. Phiên hết hạn sau một giờ. Đăng xuất hoặc reset mật khẩu thu hồi phiên; khóa tài khoản hoặc xóa hồ sơ cũng chặn truy cập liên quan ngay lần gọi tiếp theo.

## Mật khẩu và dữ liệu

Mật khẩu được xử lý bằng WebCrypto PBKDF2-HMAC-SHA256 600.000 vòng với salt riêng theo email. Client gửi proof qua HTTPS; Apps Script lưu HMAC của proof gắn email, dùng AUTH_SECRET trong Script Properties. Không lưu mật khẩu thô, proof, OTP thô hoặc token thô. Hash token nằm trong Sheet, token thô trong sessionStorage của tab.

Đây là thiết kế POC có KDF phía client, không phải dịch vụ xác thực đã được kiểm toán. Server kiểm tra định dạng proof và verifier, không tự tính PBKDF2 hay kiểm tra độ phức tạp mật khẩu gốc. Độ dài 12–128 ký tự được kiểm tra trên giao diện. Proof là credential tương đương mật khẩu và phải được giữ kín như mật khẩu.

Email cha mẹ và biệt danh bé ở dạng văn bản trong Sheet riêng tư; không mã hóa từng trường bằng khóa riêng của ứng dụng. Không thu âm, ghi hình, định vị hoặc thu thông tin sức khỏe. Cần điền thông tin liên hệ vận hành trước pilot và thống nhất cách đóng tài khoản/xóa dữ liệu với cha mẹ.

Mã email 6 số có hiệu lực 15 phút, tối đa 5 lần nhập sai và một phút giữa các lượt gửi. Sau 5 lần đăng nhập sai, tài khoản tạm khóa 15 phút. Có rate limit bằng cache và hạn mức đăng ký/gửi email theo ngày, nhưng chưa thay thế WAF hoặc chống DDoS. MailApp và Apps Script vẫn phụ thuộc quota/chính sách Google Workspace.

## Học tập và mở rộng

Giáo án giữ nguyên ID, thứ tự, mục tiêu, tiến trình và gợi ý gia đình. Điểm ứng dụng phản ánh bài nhận biết từ, không đo toàn diện năng lực phát triển, không chấm cảm xúc hoặc hoàn cảnh gia đình của trẻ. Cha mẹ cho bé học theo lượt ngắn, kết hợp hoạt động rời màn hình.

Lớp 1–5 ở trạng thái chờ nội dung. Khi mở lớp mới cần cập nhật đủ giáo án có duyệt, tạo hồ sơ theo lớp và logic tiến độ/mở khóa theo lớp. Không tự gán nội dung lớp Lá cho lớp khác.

Bài tập được máy chủ sinh đề, giữ đáp án trong cache, tự tính điểm và chống nộp lại cùng mã. Đạt ít nhất 4/5 câu đúng để mở buổi tiếp theo; trò chơi không tính vào điểm mở bài. Đề hết hạn sau 30 phút hoặc sớm hơn nếu cache bị thu hồi.

## Vận hành

setup() khởi tạo bảng thiếu và AUTH_SECRET, không xóa dữ liệu sẵn có. Nếu bản cũ đã có dữ liệu Firebase, cần sao lưu và ánh xạ UID có kiểm chứng; không tự động sửa parentUid. Giữ bí mật và sao lưu AUTH_SECRET; mất hoặc thay secret sẽ ảnh hưởng toàn bộ thông tin xác thực.

Bật installRetentionTrigger() để xóa audit quá 90 ngày và phiên hết hạn. Chủ script quản lý quyền chia sẻ Sheet, quota và sao lưu. GitHub chỉ chứa code/học liệu công khai, không chứa dữ liệu tài khoản hoặc trẻ. Khi chuyển domain riêng, cập nhật frontend HTTPS; endpoint /exec và Sheet có thể giữ nguyên nếu quyền/chính sách phù hợp.

Chi tiết từng bước trong README.md. Bản v2 là gói tải về để test riêng, không tự đẩy lên repo hoặc triển khai thay bản trước.
