import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/8daudiomaker/', // 저장소 이름과 정확히 일치, 앞뒤 슬래시 필수
})
