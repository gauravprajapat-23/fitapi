# 1. Copy and fill .env
cp .env.example .env

# 2. Install backend deps
cd backend
npm install

# 3. Generate Prisma client
npx prisma generate

# 4. Apply migrations to Neon
npx prisma migrate dev --name init

# 5. Start the API
npm run dev