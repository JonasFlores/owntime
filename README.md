# Owntime

> Agendamento online simples, seguro e organizado para pequenos negócios e equipes de atendimento.

O **Owntime** permite que clientes escolham um serviço, data e horário disponíveis sem precisar criar uma conta. Cada solicitação entra como pendente e é gerenciada por uma área administrativa: a equipe pode aprovar, recusar, configurar horários de trabalho, bloquear períodos e manter a agenda sincronizada com o Google Calendar.

O projeto oferece interface em **português e inglês**, com foco em uma experiência direta para quem agenda e em proteção dos dados de quem atende.

## ✨ Funcionalidades

- Agendamento público por serviço, data e horário;
- Calendário com horários disponíveis calculados em tempo real;
- Solicitações pendentes que já bloqueiam o horário escolhido;
- Painel administrativo com autenticação para aprovar ou recusar agendamentos;
- Gestão de serviços, duração, horário semanal e períodos indisponíveis;
- Integração com **Google Calendar**: compromissos aprovados são enviados à agenda e eventos ocupados bloqueiam novos horários;
- Notificações por e-mail via Resend;
- Interface bilíngue (PT/EN);
- Prevenção de agendamentos duplicados diretamente no banco de dados;
- Validação, rate limiting e políticas de segurança para proteger o fluxo público.

## 🧰 Stack

| Camada | Tecnologias |
| --- | --- |
| Front-end e servidor | Next.js 16, React 19 e TypeScript |
| Estilos | Tailwind CSS 4 |
| Banco de dados e autenticação | Supabase (PostgreSQL, Auth e Row Level Security) |
| Validação | Zod |
| Datas | Day.js |
| E-mails | Resend |
| Integração de agenda | Google Calendar API |
| Testes | Vitest |
| Runtime | Node.js 22.12 ou superior |

## 🚀 Como executar localmente

### Pré-requisitos

- Node.js 22.12 ou superior;
- Um projeto no Supabase;
- `npm`.

### Instalação

```bash
git clone https://github.com/JonasFlores/owntime
cd owntime
npm install
cp .env.example .env.local
```

Preencha `.env.local` com as credenciais do Supabase e as demais integrações que desejar usar. **Nunca envie esse arquivo ao GitHub.**

Para criar um banco novo, execute [`supabase/schema.sql`](./supabase/schema.sql) no SQL Editor do Supabase. Em uma base já existente, aplique os arquivos de [`supabase/migrations`](./supabase/migrations) na ordem indicada.

Depois, crie o usuário administrador no Supabase Auth e adicione seu `user_id` à tabela `admin_users`.

Inicie o ambiente de desenvolvimento:

```bash
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000) para acessar o site. O painel administrativo está em `/gestao`.

## 🔐 Variáveis de ambiente

O arquivo [`.env.example`](./.env.example) documenta todas as variáveis necessárias. As principais são:

- `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`;
- `SUPABASE_SERVICE_ROLE_KEY` — somente no servidor;
- `APPOINTMENT_TIMEZONE`;
- credenciais do Resend para e-mails;
- credenciais OAuth do Google para a sincronização do calendário;
- segredos de rate limit, webhook e cron.

> Variáveis com chaves ou segredos não devem receber o prefixo `NEXT_PUBLIC_`.

## 🧪 Qualidade

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

Ou execute toda a verificação de uma vez:

```bash
npm run check
```

## ☁️ Deploy

O projeto está preparado para rodar como aplicação Node.js. O passo a passo para publicar na Hostinger Cloud está em [DEPLOY.md](./DEPLOY.md).

Antes de colocar em produção, revise também o [checklist de auditoria](./PRODUCTION_AUDIT.md), configure as variáveis de ambiente e valide a integração com Supabase, e-mail e Google Calendar.

## 📁 Estrutura principal

```text
src/app/             Páginas, rotas e ações do Next.js
src/components/      Componentes de interface
src/lib/             Regras de negócio, integrações e validações
supabase/            Schema e migrations do banco de dados
```

## 👨‍💻 Desenvolvimento

Desenvolvido por **Jonas Flores** com o apoio do **OpenCode**.

---

Feito para tornar a rotina de agendamentos mais simples — para quem marca e para quem atende.
