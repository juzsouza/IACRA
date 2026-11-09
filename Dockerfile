# IACRA — imagem de homologação. EXCLUSIVA para IACRA-DEV.
# NÃO publicar essa imagem no serviço music-school-manager existente.
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_IACRA_BUILD_TARGET=staging
ENV VITE_IACRA_FEATURES_ENABLED=false
ENV VITE_IACRA_PRODUCTION_PROJECT_REF=xuyimfugcdkqovqelrfz
ENV VITE_SUPABASE_URL=${VITE_SUPABASE_URL}
ENV VITE_SUPABASE_ANON_KEY=${VITE_SUPABASE_ANON_KEY}
RUN test "$VITE_SUPABASE_URL" = "https://xuyimfugcdkqovqelrfz.supabase.co" \
    && { case "$VITE_SUPABASE_ANON_KEY" in sb_publishable_*|eyJ*) true ;; *) false ;; esac; } \
    && npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
ENV IACRA_BUILD_TARGET=staging
ENV SUPABASE_URL=https://xuyimfugcdkqovqelrfz.supabase.co
COPY package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
EXPOSE 8080
CMD ["node", "dist/server.cjs"]
