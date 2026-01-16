import { createTRPCReact } from '@trpc/react-query';
// 🔥 關鍵：這裡必須指向後端的 routes.ts
import type { AppRouter } from '../../../server/routes'; 

export const trpc = createTRPCReact<AppRouter>();