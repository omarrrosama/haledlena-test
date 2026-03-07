# Haled Lena — E-commerce Backend

Complete Node.js + Express + MongoDB backend with Admin Panel for Haled Lena clothing brand.

---

## 📁 Project Structure

```
haledlena/
├── src/
│   ├── server.js              # Entry point
│   ├── config/db.js           # MongoDB connection
│   ├── models/
│   │   ├── Admin.js           # Admin user model
│   │   ├── Product.js         # Product + variants model
│   │   ├── Order.js           # Order model
│   │   └── Discount.js        # Discount codes model
│   ├── routes/
│   │   ├── auth.js            # Admin auth (login, me, change-password, setup)
│   │   ├── products.js        # Products CRUD
│   │   ├── orders.js          # Orders (place, track, manage, export)
│   │   ├── discounts.js       # Discount codes CRUD
│   │   └── dashboard.js       # Dashboard stats
│   ├── middleware/
│   │   ├── auth.js            # JWT protect middleware
│   │   └── upload.js          # Multer image upload
│   └── utils/
│       ├── email.js           # Nodemailer (order confirm, admin notify, status updates)
│       └── excel.js           # ExcelJS order export
├── admin/                     # Admin Panel (HTML/CSS/JS — no framework)
│   ├── index.html
│   ├── css/style.css
│   └── js/app.js
├── uploads/products/          # Product images (auto-created)
├── seed.js                    # Database seed script
├── .env.example               # Environment variables template
└── package.json
```

---

## 🚀 Setup & Run

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
```
Then edit `.env` with your values (MongoDB URI, email config, etc.)

### 3. Seed the database (creates admin + sample products)
```bash
node seed.js
```
Default admin credentials: **username:** `admin` / **password:** `Admin@123`

### 4. Start the server
```bash
# Development (auto-reload)
npm run dev

# Production
npm start
```

### 5. Open the admin panel
Visit: **http://localhost:5000/admin**

---

## 🔌 API Endpoints

### Public (no auth needed)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/products | List active products (filter: category, featured, search) |
| GET | /api/products/categories | Get all categories |
| GET | /api/products/:id | Get single product |
| POST | /api/orders | Place an order (COD) |
| POST | /api/orders/validate-discount | Validate a discount code |
| GET | /api/orders/track/:orderNumber | Track order by number |
| GET | /api/health | Health check |

### Admin (requires JWT Bearer token)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/login | Admin login |
| GET | /api/auth/me | Get current admin |
| POST | /api/auth/change-password | Change password |
| POST | /api/auth/setup | First-time setup (if no admin exists) |
| GET | /api/products/admin/all | All products (including inactive) |
| POST | /api/products | Create product (multipart/form-data) |
| PUT | /api/products/:id | Update product |
| DELETE | /api/products/:id | Delete product |
| GET | /api/orders | List orders (filter: status, search, date range) |
| GET | /api/orders/:id | Get order details |
| PATCH | /api/orders/:id/status | Update order status |
| PATCH | /api/orders/:id/notes | Save admin notes |
| GET | /api/orders/export/excel | Download orders as Excel |
| GET | /api/discounts | List discount codes |
| POST | /api/discounts | Create discount code |
| PUT | /api/discounts/:id | Update discount code |
| DELETE | /api/discounts/:id | Delete discount code |
| GET | /api/dashboard/stats | Dashboard statistics |

---

## 🛒 Order Placement (Frontend Integration)

```javascript
// Example: place an order from the frontend
const response = await fetch('/api/orders', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    customer: {
      name: 'John Doe',
      phone: '+961 71 123 456',
      email: 'john@example.com',   // optional
      address: '123 Main Street',
      city: 'Beirut',
      notes: 'Ring the bell'        // optional
    },
    items: [
      {
        productId: '64abc...',
        quantity: 2,
        size: 'M',
        color: 'Black'
      }
    ],
    discountCode: 'WELCOME10',      // optional
    shippingFee: 5.00               // optional, default 0
  })
});
```

---

## 📧 Email Setup (Gmail)

1. Enable 2-Step Verification on your Gmail account
2. Generate an App Password: Google Account > Security > App Passwords
3. Add to `.env`:
```
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your@gmail.com
EMAIL_PASS=your_16_char_app_password
EMAIL_FROM=Haled Lena <your@gmail.com>
ADMIN_EMAIL=admin@haledlena.com
```

---

## 🧾 Excel Export

The admin panel has an **Export Excel** button on the Orders page. It exports orders filtered by the current search/status/date filters. The Excel file includes:
- Order number, date, customer info, items, totals, discount, status
- Color-coded status column
- Auto-filter and frozen header row

---

## 🔒 Security Notes

- Change `JWT_SECRET` in production to a long random string
- Change the default admin password after first login
- Consider adding rate limiting (`express-rate-limit`) for production
- Store `.env` in `.gitignore` — never commit it

---

## 📦 Dependencies

| Package | Purpose |
|---------|---------|
| express | Web framework |
| mongoose | MongoDB ODM |
| bcryptjs | Password hashing |
| jsonwebtoken | JWT auth |
| nodemailer | Email sending |
| multer | File upload |
| exceljs | Excel export |
| express-validator | Input validation |
| cors | CORS headers |
| morgan | HTTP logging |
| dotenv | Environment variables |
