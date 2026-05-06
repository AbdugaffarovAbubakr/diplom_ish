# AI Kredit Risk Tizimi

Node.js + Express + MongoDB asosidagi moliyaviy risk baholash va kredit tavsiya tizimi.

## Ishga tushirish

1. `npm install`
2. `.env.example` faylidan `.env` yarating
3. MongoDB ishga tushgan bo'lsin
4. `npm start`
5. Brauzerda: `http://localhost:5000`

## API

- `POST /api/analyze`
- `GET /api/history`
- `DELETE /api/history/:id`

## Algoritm

- Fuzzy Logic (daromad/xarajat noaniqligi)
- Monte Carlo (1200 scenario)
- Logistic Regression (repay probability)
- Final Risk:
  - `finalRisk = fuzzy*0.5 + monteCarlo*0.3 + mlRisk*0.2`

## Frontend

- Responsive form
- Risk indicator (green/yellow/red)
- Chart.js bar chart
- History ro'yxati va delete
