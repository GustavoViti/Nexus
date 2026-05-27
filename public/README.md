# Nexus — Controle Financeiro Pessoal

Aplicação web de gestão financeira pessoal com sincronização em tempo real via Firebase. Interface em português (pt-BR), design dark mobile-first instalável como PWA, sem frameworks ou bundler.

---

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | HTML5, CSS3, JavaScript ES6+ (módulos nativos) |
| Autenticação | Firebase Authentication (email/senha) |
| Banco de dados | Cloud Firestore (NoSQL, tempo real) |
| Gráficos | Chart.js 4.x (via CDN) |
| PWA | manifest.json + Service Worker (network-first) |
| Hospedagem | Firebase Hosting (estático) |

Sem frameworks, sem bundler — importações via `<script type="module">` direto no navegador.

---

## Estrutura de arquivos

```
public/
├── index.html            # Tela de login
├── register.html         # Tela de cadastro
├── app.html              # Dashboard principal
├── manifest.json         # Manifesto PWA (ícone, nome, tema)
├── sw.js                 # Service Worker (network-first, habilita instalação)
├── script/
│   ├── firebase.js       # Inicialização e exportação do SDK Firebase
│   ├── auth.js           # register / login / logout / watchAuth
│   ├── db.js             # CRUD de contas, categorias, transações e configurações
│   ├── seed.js           # Categorias padrão pré-definidas
│   ├── login.js          # Lógica da tela de login
│   ├── register.js       # Lógica da tela de cadastro
│   └── app.js            # Toda a lógica do dashboard
├── style/
│   ├── auth.css          # Estilos das telas de autenticação
│   └── app.css           # Estilos do dashboard (design system completo)
└── assets/
    ├── logo_fundo_branco.png
    ├── nexus premium.png
    └── nexus demonstração.gif
```

---

## Modelo de dados (Firestore)

```
users/{uid}
  ├── accounts/{accountId}
  │     name: string
  │     type: string  ("bank" | "cash" | "card")
  │     initialBalance: number
  │     createdAt: Timestamp
  │
  ├── categories/{categoryId}
  │     name: string
  │     type: "expense" | "income"
  │     createdAt: Timestamp
  │
  ├── transactions/{txId}
  │     type: "expense" | "income"
  │     amount: number
  │     date: string (YYYY-MM-DD)
  │     description: string
  │     accountId: string
  │     categoryId: string
  │     notes: string
  │     createdAt: Timestamp
  │
  └── settings/main
        monthlyBudget: number
        categoryLimits: { [categoryId]: number }
```

Cada usuário é completamente isolado — não há dados compartilhados entre coleções de diferentes usuários.

---

## Fluxo de autenticação

```
index.html (login)
    └── login.js → auth.js:login() → Firebase Auth
            ↓ sucesso
        app.html
            └── app.js → auth.js:watchAuth()
                    ├── autenticado → inicializa listeners Firestore
                    └── ausente     → redireciona para index.html

register.html (cadastro)
    └── register.js → auth.js:register()
            ├── createUserWithEmailAndPassword
            ├── updateProfile (displayName)
            └── cria documento users/{uid} no Firestore
```

---

## Módulos principais

### `firebase.js`
Inicializa o app Firebase e exporta as instâncias de `auth` e `db` usadas pelos demais módulos.

---

### `auth.js`
Encapsula todas as operações de autenticação:

```js
register({ name, email, password })  // cria conta + documento Firestore
login({ email, password })           // autenticação por email/senha
logout()                             // encerra sessão
watchAuth({ onIn, onOut })           // listener de estado de autenticação
```

---

### `db.js`
Interface com o Firestore. Todas as funções recebem `uid` como primeiro argumento.

**Contas:**
```js
createAccount(uid, { name, type, initialBalance })
updateAccount(uid, accountId, data)
deleteAccount(uid, accountId)
listAccounts(uid)
watchAccounts(uid, { onChange, onError })
```

**Categorias:**
```js
createCategory(uid, { name, type })
updateCategory(uid, categoryId, data)
deleteCategory(uid, categoryId)
listCategories(uid)
```

**Transações:**
```js
createTransaction(uid, tx)
updateTransaction(uid, txId, data)
deleteTransaction(uid, txId)
watchTransactionsMonth(uid, { startDate, endDate, onChange, onError })
watchTransactionsAll(uid, { onChange, onError })
```

**Configurações:**
```js
watchSettings(uid, { onChange, onError })
setMonthlyBudget(uid, monthlyBudget)
setCategoryLimits(uid, limits)   // { [categoryId]: number }
```

---

### `seed.js`
Popula categorias padrão via `seedDefaultCategories(uid)`.

**Despesas (8):** Alimentação, Transporte, Assinaturas, Lazer, Saúde, Casa, Compras, Transferência  
**Receitas (5):** Salário, Freela, Reembolso, Outros, Transferência

---

### `app.js`
Módulo central do dashboard.

**Estado global:**
```js
currentUser      // usuário autenticado
viewMode         // "month" | "history"
selectedMonth    // Date com o mês ativo
accounts         // array de contas
categories       // array de categorias
allTxCache       // todas as transações (usado para saldo patrimonial e gráfico)
currentTxList    // transações do período atual (após filtros)
settings         // { monthlyBudget }
catLimits        // { [categoryId]: number }
editingTxId      // ID da transação em edição (null = nova)
editingAccountId // ID da conta em edição
```

**Utilitários:**
```js
formatBRL(n)           // → "R$ 1.234,56"
formatDateBR(str)      // "2025-01-15" → "15/01/2025"
parseMoneyBR(value)    // "1.234,56" → 1234.56
getMonthRange(date)    // → { startDate, endDate } em YYYY-MM-DD
monthShort(dt)         // → "jan 25"
addMonths(dateStr, n)  // avança n meses em YYYY-MM-DD (trata fim de mês)
escapeHtml(str)        // sanitização XSS
```

**Pipeline de renderização:**
```
Firestore listener dispara
    ├── computeDashboard(items)       → totais + badge de saúde + orçamento
    │       ├── renderComparison()   → badges de % vs mês anterior
    │       └── renderInsights()     → chips de insights (maior gasto, categoria líder...)
    ├── computeAccountBalances()     → patrimônio total + saldo real por conta
    ├── renderAccounts(balances)     → cards de conta clicáveis (abre edição)
    ├── renderTransactions(items)    → lista filtrada por busca
    └── renderCharts(items)
            ├── doughnut             → distribuição por categoria (12 cores)
            └── line                 → evolução do saldo nos últimos 6 meses
```

**Transferências:**
Geram duas transações vinculadas — despesa na conta origem e receita na conta destino — usando a categoria "Transferência" de cada tipo.

**Parcelamentos:**
Ao marcar o checkbox de parcelamento, o formulário de transação cria N lançamentos com datas calculadas por `addMonths()` e sufixo `(i/N)` na descrição.

**Saúde financeira:**

| Badge | Condição |
|---|---|
| Verde (ok) | taxa de poupança ≥ 20% |
| Amarelo (warn) | taxa de poupança < 20% |
| Vermelho (bad) | saldo negativo |

---

## Design system

Paleta indigo dark definida em `app.css`:

```css
--bg:      #080B12   /* fundo principal */
--panel:   #0F1320   /* painéis */
--panel-2: #161B2E   /* painéis secundários */
--border:  #1E2640   /* bordas */
--text:    #F1F5F9   /* texto principal */
--muted:   #8B95B0   /* texto secundário */
--accent:  #6366F1   /* indigo (ação principal) */
--accent2: #4F46E5   /* indigo escuro (gradiente) */
--danger:  #EF4444   /* vermelho */
--success: #22C55E   /* verde */
```

**Componentes principais:**
- Bottom nav (5 botões fixos, visível apenas em ≤ 640px) com FAB central
- Bottom sheet modal (desliza de baixo no mobile, centralizado no desktop)
- Hero card com patrimônio total em destaque (34px bold)
- Cards de conta clicáveis com saldo calculado em tempo real
- Chips de insights com scroll horizontal
- Barras de limite por categoria (indigo → amarelo → vermelho)

---

## PWA

O app é instalável como Progressive Web App em Android, iOS e desktop:

- `manifest.json` — nome, ícone, tema indigo, `display: standalone`
- `sw.js` — service worker network-first (sem cache offline; requer conexão Firebase)
- Meta tags Apple (`apple-mobile-web-app-capable`, status bar, ícone touch)

---

## Configuração e deploy

### Pré-requisitos
- Projeto Firebase com **Authentication** (email/senha) e **Firestore** habilitados
- Firebase CLI: `npm install -g firebase-tools`

### Configurar Firebase
Edite `script/firebase.js` com as credenciais do seu projeto:

```js
const firebaseConfig = {
  apiKey: "...",
  authDomain: "seu-projeto.firebaseapp.com",
  projectId: "seu-projeto",
  storageBucket: "seu-projeto.firebasestorage.app",
  messagingSenderId: "...",
  appId: "..."
};
```

### Deploy

```bash
firebase login
firebase init hosting   # aponte para a pasta public/
firebase deploy
```

### Desenvolvimento local

```bash
firebase serve --only hosting
# ou qualquer servidor HTTP estático:
npx serve public/
```

> Não há processo de build. O projeto roda diretamente como arquivos estáticos.

---

## Segurança

- **XSS:** todo conteúdo inserido via `innerHTML` passa por `escapeHtml()` antes da renderização
- **Isolamento:** todas as queries incluem o `uid` do usuário; regras do Firestore restringem acesso ao próprio documento
- **Auth:** Firebase Auth gerencia tokens JWT automaticamente; qualquer rota sem usuário redireciona para `index.html`

**Regras Firestore recomendadas:**
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

---

## Funcionalidades

**Contas e transações**
- Múltiplas contas com saldo inicial e tipos customizáveis
- Transações de receita e despesa com categoria, conta e notas
- Edição e exclusão de transações, contas e categorias
- Transferências entre contas (par de transações automático)
- Parcelamentos: cria N lançamentos mensais a partir de uma data

**Dashboard**
- Patrimônio total em destaque (soma de todas as contas em tempo real)
- Saldo líquido do mês (receitas − despesas)
- Comparativo % vs mês anterior em receitas e saídas
- Indicador de saúde financeira (taxa de poupança)
- Meta de orçamento mensal com barra de progresso
- Painel de insights (maior gasto, categoria líder, taxa de economia, variação de saldo)

**Gráficos**
- Rosca de distribuição por categoria (12 cores)
- Linha de evolução do saldo nos últimos 6 meses

**Organização**
- Navegação por mês (com setas) ou histórico completo
- Busca por descrição, observação, categoria ou conta
- Gerenciamento de categorias (criar, excluir, agrupar por tipo)
- Limites mensais por categoria com barra de progresso colorida

**Exportação e configurações**
- Exportar transações para CSV (separador `;`, compatível com Excel pt-BR)
- Categorias padrão com seed em um clique
- Sair da conta via menu de configurações ou topbar

**PWA e mobile**
- Instalável como app (manifest + service worker)
- Bottom nav com FAB para novo lançamento
- Bottom sheet modals com animação de slide
- Layout responsivo mobile-first
