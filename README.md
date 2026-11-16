# Mês Claro

Organizador mensal de contas fixas e fatura do cartão. O app guarda uma cópia local no navegador e, depois de configurar o Firebase e entrar com Google, sincroniza os dados do usuário no Cloud Firestore.

## Configurar o Firebase

1. Crie um projeto no [Firebase Console](https://console.firebase.google.com/) e registre um app Web.
2. Copie o objeto de configuração do app para `firebase-config.js` (`apiKey`, `authDomain`, `projectId` e `appId`). A configuração web identifica o projeto; o acesso aos dados é limitado pelas regras do Firestore.
3. Em **Authentication → Sign-in method**, habilite Google.
4. Crie um banco **Cloud Firestore**.
5. Publique o conteúdo de `firestore.rules` em **Firestore Database → Rules**.
6. Em **Authentication → Settings → Authorized domains**, adicione o domínio em que o site será aberto (por exemplo, `localhost` durante uso local).

## Abrir localmente

Como o app usa módulos JavaScript do Firebase, abra-o por um servidor HTTP local, não pelo endereço `file://`. Na pasta deste projeto, execute:

```powershell
python -m http.server 8000
```

Depois acesse `http://localhost:8000` no navegador.

## Publicar no Firebase Hosting

Instale o Firebase CLI e associe esta pasta ao projeto criado acima:

```powershell
npm install -g firebase-tools
firebase login
firebase use --add
firebase deploy --only hosting,firestore:rules
```

O domínio gerado pelo Hosting também precisa estar em **Authorized domains** no Firebase Authentication.

## Dados e sincronização

- O app mantém uma cópia em `localStorage` e envia a mesma estrutura ao documento `users/{uid}/appData/main`.
- As regras permitem que cada conta Google leia e altere somente o próprio documento.
- No primeiro acesso, os dados locais existentes são mesclados com os dados da nuvem; despesas e meses distintos são mantidos.
- O backup JSON continua disponível na interface.
- `firebase-config.js` contém a configuração web pública do projeto e precisa ser servido junto com o app.
