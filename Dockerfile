# Stage 1: Build the React application and Node/Express backend
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Somente configuracoes PUBLICÁVEIS do Supabase PROD. Nunca incluir chave secreta.
# Novas funcionalidades permanecem DESLIGADAS ate validar migracoes.
ARG VITE_SUPABASE_URL=https://ldumzwrwbhjtrnlioigg.supabase.co
ARG VITE_SUPABASE_ANON_KEY=sb_publishable_D3KsTVDO7vls5m-IMueu6A_VS7GJTpH
ENV VITE_SUPABASE_URL=${VITE_SUPABASE_URL}
ENV VITE_SUPABASE_ANON_KEY=${VITE_SUPABASE_ANON_KEY}
# Versao candidata de restauracao: os modulos ja aprovados em producao precisam
# permanecer ligados na compilacao do Docker feita por Cloud Run --source.
# Protegido por referencia exata do Supabase PROD e permissoes por usuario.
# Nao propagar esta alteracao para o Dockerfile base sem nova revisao.
ARG VITE_IACRA_FEATURES_ENABLED=true
ENV VITE_IACRA_FEATURES_ENABLED=${VITE_IACRA_FEATURES_ENABLED}
ENV VITE_IACRA_PRODUCTION_PROJECT_REF=ldumzwrwbhjtrnlioigg
ENV VITE_IACRA_BUILD_TARGET=production
RUN npm run build

# Stage 2: Serve both /api routes and static SPA assets using Node/Express
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
# Cliente público de consulta (NÃO é service_role)
ENV SUPABASE_URL=https://ldumzwrwbhjtrnlioigg.supabase.co
COPY package*.json ./
COPY --from=builder /app/node_modules ./node_modules
# A chave publicável não autoriza acesso administrativo privilegiado.
ARG SUPABASE_PUBLISHABLE_KEY=sb_publishable_D3KsTVDO7vls5m-IMueu6A_VS7GJTpH
ENV SUPABASE_KEY=${SUPABASE_PUBLISHABLE_KEY}
COPY --from=builder /app/dist ./dist
EXPOSE 8080
CMD ["node", "dist/server.cjs"]

