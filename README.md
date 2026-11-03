# yafmcp

Servidor **MCP** para operar um servidor **FiveM**: o agente manda um comando, o comando
entra no console do FXServer e a saída do console volta como resposta.

Funciona com qualquer cliente MCP — Claude Code, Hermes, Codex, OpenCode, ou o que vier
depois — porque é MCP por stdio puro (e HTTP streamable quando você quiser).

## Como ele fala com o servidor

Pelo **live console do txAdmin** (v7/v8): login por senha em `/auth/password`, sessão
guardada em cookie, e o comando vai pelo socket.io na sala `liveconsole`, exatamente
como a aba Live Console do painel faz. A saída é capturada do stream `consoleData`,
limpa de ANSI e devolvida.

Não precisa de `rcon_password`, não precisa reiniciar o servidor, não precisa de acesso
ao container.

> O socket.io do txAdmin só responde por **long-polling**: o servidor HTTP que escuta na
> porta do painel roteia `/socket.io` para `engine.handleRequest`, e não trata upgrade de
> websocket. O cliente aqui já vem fixado em `polling` por causa disso.

## Instalação

Pelo npm, sem clonar nada:

```bash
npx -y yafmcp --setup     # grava as credenciais do txAdmin
npx -y yafmcp --doctor    # confere a conexão
```

Ou do repositório, para mexer no código:

```bash
git clone https://github.com/ggfto/yafmcp.git
cd yafmcp
pnpm install
pnpm run setup     # pergunta URL do txAdmin, usuário e senha; grava 600 em ~/.config/yafmcp/config.json
pnpm run doctor    # loga, conecta no console e roda um "version"
```

Requer Node 18+ (testado no 22) e um admin do txAdmin com permissão de console
(`console.view` + `console.write`; o master já tem).

### Configuração

`~/.config/yafmcp/config.json` (ou variáveis de ambiente, que têm precedência):

| Campo | Env | Padrão |
| --- | --- | --- |
| `txadminUrl` | `FIVEM_TXADMIN_URL` | `http://127.0.0.1:40120` |
| `serverUrl` | `FIVEM_SERVER_URL` | `http://127.0.0.1:30120` |
| `username` | `FIVEM_TXADMIN_USER` | — |
| `password` | `FIVEM_TXADMIN_PASS` | — |
| `quietMs` | `FIVEM_QUIET_MS` | `900` — silêncio no console que fecha a captura |
| `timeoutMs` | `FIVEM_TIMEOUT_MS` | `10000` — teto da captura |
| `scrollback` | — | `2000` linhas guardadas em memória |
| `logsDir` | `FIVEM_LOGS_DIR` | vazio — acha `txData/<perfil>/logs` pelo FXServer rodando na mesma máquina |

## Registrando nos agentes

```bash
node src/register.js          # registra em todos os clientes presentes na máquina
node src/register.js --print  # só imprime os trechos, você cola onde quiser
```

Ou na mão:

Em todos os exemplos abaixo, `npx -y yafmcp` e `node /caminho/yafmcp/src/index.js`
são intercambiáveis — o primeiro dispensa clone, o segundo usa a sua cópia local.

```bash
# Claude Code
claude mcp add --scope user fivem -- npx -y yafmcp
```

```toml
# Codex — ~/.codex/config.toml
[mcp_servers.fivem]
command = "node"
args = ["/caminho/yafmcp/src/index.js"]
```

```json
// OpenCode — ~/.config/opencode/opencode.json
{ "mcp": { "fivem": { "type": "local", "command": ["node", "/caminho/yafmcp/src/index.js"], "enabled": true } } }
```

```yaml
# Hermes — ~/.hermes/config.yaml
mcp_servers:
  fivem:
    command: node
    args:
      - /caminho/yafmcp/src/index.js
    enabled: true
```

## Ferramentas

| Ferramenta | O que faz |
| --- | --- |
| `fivem_command` | Executa qualquer comando no console e devolve a saída. Para resource, `ensure <resource>` é o padrão (inicia ou reinicia); `refresh` antes se o resource é novo no disco. `timeoutMs`, `quietMs` e `timestamps` são opcionais. |
| `fivem_console` | Últimas linhas do console capturadas pela sessão, com `filter` por regex. |
| `fivem_logs` | Arquivos de log do txAdmin: `fxserver.log` (dia inteiro, boots anteriores), dias rotacionados e `admin.log`. `sinceBoot` corta no último start, `filter` por regex, `list` mostra os arquivos. Só lê arquivo de dentro da pasta de logs. |
| `fivem_status` | No ar?, hostname, jogadores, game build, nº de resources. |
| `fivem_players` | Jogadores online com id, ping e identificadores. |
| `fivem_server_control` | `start` / `stop` / `restart` do processo do servidor (derruba quem estiver online). |

```
> recarrega o resource mri_Qadmin
  fivem_command("ensure mri_Qadmin")
  $ ensure mri_Qadmin
  [           resources] Stopping resource mri_Qadmin
  [    c-scripting-core] Creating script environments for mri_Qadmin
  [           resources] Started resource mri_Qadmin
```

## Outros modos

```bash
node src/index.js                   # MCP stdio (o normal)
node src/index.js --http --port 8765  # MCP streamable HTTP em /mcp, para clientes que falam por URL
node src/index.js --exec "refresh"  # um comando direto pelo terminal, sem agente no meio
node src/index.js --logs "error"    # fxserver.log desde o último boot, filtrado
node src/index.js --doctor          # diagnóstico da conexão
```

## Agente dedicado no Clink (opcional)

Quem usa o [Clink](https://github.com/ggfto/clink) pode criar um tipo de agente
**FiveM Ops** — mission + rule sheet — que nasce sabendo operar o servidor:

```bash
node tools/clink-agent.js
clink new "FiveM Ops" "FiveM"
```

`FIVEM_DEFAULT_PATH` escolhe a pasta em que esse agente abre (padrão `~/fx-panel`).

## Segurança

Nenhum comando é bloqueado: quem tem o MCP tem o console do servidor inteiro. A senha
fica só no arquivo de config (modo 600) ou no ambiente — nunca no repositório, nunca no
prompt do agente. Se isso for demais para o seu caso, dê ao MCP um admin do txAdmin com
permissões reduzidas: a checagem de permissão é feita pelo próprio txAdmin.

## Publicando o pacote

Mesmo esquema do `mri-ui-kit`, sem passo manual:

- **Commits no padrão [Conventional Commits](https://www.conventionalcommits.org/)** — é
  deles que sai a versão. `fix:` vira patch, `feat:` vira minor, `feat!:`/`BREAKING CHANGE`
  vira major; `chore:`, `ci:`, `docs:`, `test:` não geram versão.
- **`release.yml`** roda a cada push na `main`: testa e chama o `semantic-release`, que
  bumpa o `package.json`, escreve o `CHANGELOG.md`, commita `chore(release): x.y.z` e cria
  a tag e a release no GitHub. Não publica nada.
- **`publish.yml`** roda logo depois (ou na mão, pela aba Actions) e publica no npmjs.com
  por **trusted publishing (OIDC)**, sem `NPM_TOKEN`. Se a versão do `package.json` já
  está no npm, não faz nada.

Configuração única no npmjs.com: pacote `yafmcp` → Settings → Trusted publisher → GitHub
Actions, repositório `mri-Qbox-Brasil/yafmcp`, workflow `publish.yml`.

`ci.yml` roda os testes em push e PR, no Node 20, 22 e 24.

## Licença

MIT.
