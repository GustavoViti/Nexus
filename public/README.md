# Nexus — Controle Financeiro Pessoal

Aplicação web de gestão financeira pessoal com sincronização em tempo real via Firebase. Interface em português (pt-BR) com suporte a múltiplas contas, categorias, transferências, metas de orçamento e visualizações gráficas.

---

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | HTML5, CSS3, JavaScript ES6+ (módulos nativos) |
| Autenticação | Firebase Authentication (email/senha) |
| Banco de dados | Cloud Firestore (NoSQL, tempo real) |
| Gráficos | Chart.js 4.x (via CDN) |
| Hospedagem | Firebase Hosting (estático) |

Sem frameworks, sem bundler — importações via `<script type="module">` direto no navegador.

---

## Estrutura de arquivos

```
public/
├── index.html            # Página de login
├── register.html         # Página de cadastro
├── app.html              # Dashboard principal
├── script/
│   ├── firebase.js       # Inicialização e exportação do SDK Firebase
│   ├── auth.js           # register / login / logout / watchAuth
│   ├── db.js             # CRUD de contas, categorias, transações e configurações
│   ├── seed.js           # Categorias padrão pré-definidas
│   ├── login.js          # Lógica da tela de login
│   ├── register.js       # Lógica da tela de cadastro
│   ├── app.js            # Toda a lógica do dashboard (811 linhas)
│   └── ui.js             # Reservado (vazio)
├── style/
│   ├── auth.css          # Estilos das telas de autenticação
│   └── app.css           # Estilos do dashboard
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
  │     type: "corrente" | "poupança" | "carteira" | ...
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
                    ├── usuário autenticado → inicializa listeners Firestore
                    └── usuário ausente → redireciona para index.html

register.html (cadastro)
    └── register.js → auth.js:register()
            ├── createUserWithEmailAndPassword
            ├── updateProfile (displayName)
            └── cria documento users/{uid} no Firestore
```

---

## Módulos principais

### `firebase.js`
Inicializa o app Firebase com as credenciais do projeto e exporta as instâncias de `auth` e `db` usadas pelos demais módulos.

**Projeto Firebase:** `nexus-11148`

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
Interface com o Firestore. Separa operações em grupos:

**Contas:**
```js
createAccount(uid, { name, type, initialBalance })
listAccounts(uid)
watchAccounts(uid, { onChange, onError })
```

**Categorias:**
```js
createCategory(uid, { name, type })
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
```

---

### `seed.js`
Popula categorias padrão para um novo usuário via `seedDefaultCategories(uid)`.

**Despesas (8):** Alimentação, Transporte, Assinaturas, Lazer, Saúde, Casa, Compras, Transferência  
**Receitas (5):** Salário, Freela, Reembolso, Outros, Transferência

---

### `app.js`
Módulo central do dashboard. Responsável por:

**Estado global:**
```js
currentUser   // usuário autenticado
viewMode      // "month" | "history"
selectedMonth // Date com o mês ativo
accounts      // array de contas do usuário
categories    // array de categorias
allTxCache    // cache de todas as transações (para saldo por conta)
settings      // { monthlyBudget }
editingTxId   // ID da transação em edição (null = nova)
```

**Funções utilitárias:**
```js
formatBRL(n)           // formata número para R$ 1.234,56
formatDateBR(str)      // converte YYYY-MM-DD para DD/MM/YYYY
parseMoneyBR(value)    // parseia entrada com vírgula decimal
getMonthRange(date)    // retorna { startDate, endDate } do mês
escapeHtml(str)        // sanitização contra XSS
```

**Pipeline de renderização:**
```
Firestore listener dispara
    └── computeDashboard(items)      → totais de receita/despesa/saldo
    └── computeAccountBalances()     → saldo real por conta (histórico completo)
    └── renderAccounts(balances)     → cards de conta + barra de orçamento
    └── renderTransactions(items)    → lista de transações clicável
    └── renderCharts(items)          → gráfico rosca (categorias) + barras (mensal)
```

**Transferências:**  
Criam duas transações vinculadas — uma despesa na conta de origem e uma receita na conta de destino — usando a categoria "Transferência" de cada tipo (cria automaticamente se não existir).

**Saúde financeira:**

| Badge | Condição |
|---|---|
| `ok` (verde) | taxa de poupança >= 20% |
| `warn` (amarelo) | taxa de poupança < 20% |
| `bad` (vermelho) | saldo negativo |

---

## Visual e responsividade

O design usa variáveis CSS globais definidas em `auth.css`:

```css
--bg:      #0B0F14   /* fundo principal */
--panel:   #111827   /* painéis */
--panel-2: #1F2937   /* painéis secundários */
--border:  #243041   /* bordas */
--text:    #F3F4F6   /* texto principal */
--muted:   #9CA3AF   /* texto secundário */
--accent:  #22C55E   /* verde (ação principal) */
--danger:  #EF4444   /* vermelho (alerta) */
```

**Breakpoints responsivos:**

| Ponto | Comportamento |
|---|---|
| <= 700px | Gráficos empilhados em coluna única |
| <= 520px | Resumo, ações e grid de contas em coluna única |
| <= 420px | Formulários de autenticação em coluna única |

---

## Configuração e deploy

### Pré-requisitos
- Projeto Firebase com **Authentication** (email/senha) e **Firestore** habilitados
- Firebase CLI instalado (`npm install -g firebase-tools`)

### Configuração do Firebase
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
- **Isolamento de dados:** todas as queries incluem `uid` do usuário autenticado; regras do Firestore devem restringir leitura/escrita ao próprio documento do usuário
- **Autenticação:** Firebase Auth gerencia tokens JWT automaticamente; rotas sem usuário autenticado redirecionam para `index.html`

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

- Cadastro e login com Firebase Auth
- Múltiplas contas com tipos customizáveis
- Transações de receita e despesa com categorias e notas
- Transferências entre contas (gera par de transações automaticamente)
- Navegação por mês ou histórico completo
- Gráfico de distribuição por categoria (rosca)
- Gráfico de receita vs despesa mensal (barras)
- Meta de orçamento mensal com barra de progresso
- Indicador de saúde financeira (taxa de poupança)
- Categorias padrão com seed em um clique
- Sincronização em tempo real via Firestore listeners
- Interface responsiva para mobile
