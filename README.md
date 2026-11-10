<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/marca/escrevoz-escuro.svg">
  <img src="docs/marca/escrevoz-claro.svg" width="360" alt="Escrevoz">
</picture>

Ditado por voz para Mac, de graça e sem internet.

</div>

Você aperta um atalho, fala, e o texto aparece onde o cursor estiver: no WhatsApp, no e-mail, no código. O reconhecimento de voz roda no seu Mac. Nenhum áudio sai do computador.

O Escrevoz foi feito para quem dita o dia inteiro em português. Ele parte do [Handy](https://github.com/cjpais/Handy), de CJ Pais, e muda o que mais atrapalhava no dia a dia.

## O que ele faz

- **Pontuação de verdade.** Com o modelo Parakeet, o texto já sai com vírgula e ponto, sem um segundo programa corrigindo.
- **Nada se perde.** Se o texto não colar (o foco mudou, não havia campo), aparece o cartão "Não colou?". Clique no campo certo e depois na linha: o texto cola ali, e o seu clipboard fica como estava.
- **Os últimos ditados à mão.** ⌥⇧H mostra os cinco últimos. ⌥⇧V cola o último de novo. O menu da barra também lista os cinco.
- **Troca exata de palavras.** Se o modelo ouve "Jev" quando você diz "dev", uma regra resolve: ouço X, escrevo Y.
- **Histórico do clipboard.** ⌘⇧V abre o que você copiou, só texto, guardado com criptografia.

## Como instalar

Ainda não há versão pronta para baixar. Por enquanto, compile no seu Mac:

```bash
bun install
mkdir -p src-tauri/resources/models
curl -L -o src-tauri/resources/models/silero-vad-v6.2-F32.gguf https://huggingface.co/handy-computer/silero-vad-v6.2-gguf/resolve/main/silero-vad-v6.2-F32.gguf
CMAKE_POLICY_VERSION_MINIMUM=3.5 bun run tauri build --bundles app
```

Você precisa de [Rust](https://rustup.rs/) e [Bun](https://bun.sh/). Os detalhes estão em [BUILD.md](BUILD.md). Por enquanto, só para macOS.

## Créditos

O Escrevoz é baseado no [Handy](https://github.com/cjpais/Handy), de CJ Pais, sob a licença MIT. O reconhecimento de voz usa o transcribe.cpp e o [ggml](https://github.com/ggml-org/ggml).

## Licença

[MIT](LICENSE).
