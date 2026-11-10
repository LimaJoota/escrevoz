<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/marca/escrevoz-escuro.svg">
  <img src="docs/marca/escrevoz-claro.svg" width="340" alt="Escrevoz">
</picture>

### Ditado por voz para Mac, de graça e sem internet

Aperte um atalho, fale, e o texto aparece onde o cursor estiver.<br>
Com vírgula, ponto e acento. Nenhum áudio sai do seu Mac.

<br>

<a href="https://github.com/LimaJoota/escrevoz/releases/latest"><img src="https://img.shields.io/badge/Baixar_para_Mac-FF5A1F?style=for-the-badge&logo=apple&logoColor=white" alt="Baixar para Mac" height="44"></a>

<br><br>

[![Estrelas](https://img.shields.io/github/stars/LimaJoota/escrevoz?style=flat&label=estrelas&labelColor=15171A&color=FF5A1F)](https://github.com/LimaJoota/escrevoz/stargazers)
[![Versão](https://img.shields.io/github/v/release/LimaJoota/escrevoz?label=vers%C3%A3o&labelColor=15171A&color=3A3F45)](https://github.com/LimaJoota/escrevoz/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/LimaJoota/escrevoz/total?label=downloads&labelColor=15171A&color=3A3F45)](https://github.com/LimaJoota/escrevoz/releases)
[![macOS](https://img.shields.io/badge/macOS-Apple_Silicon-3A3F45?labelColor=15171A&logo=apple&logoColor=white)](#instalar)
[![Licença MIT](https://img.shields.io/badge/licen%C3%A7a-MIT-3A3F45?labelColor=15171A)](LICENSE)

</div>

## Instalar

Pelo Homebrew, o jeito mais fácil:

```bash
brew tap limajoota/escrevoz https://github.com/LimaJoota/escrevoz
brew trust limajoota/escrevoz
brew install --cask escrevoz
```

Ou baixe o [DMG](https://github.com/LimaJoota/escrevoz/releases/latest) e arraste o Escrevoz para Aplicativos. Na primeira vez, o macOS não deixa abrir, porque o app ainda não tem a assinatura paga da Apple. Abra **Ajustes do Sistema › Privacidade e Segurança** e clique em **Abrir Mesmo Assim**. Pelo Homebrew, esse passo não aparece.

Você precisa de um Mac com chip Apple (M1 ou mais novo). Ao abrir, o Escrevoz pede o microfone e a acessibilidade (para colar o texto) e baixa o modelo de voz.

## O que ele faz

- **Pontuação de verdade.** Com o modelo Parakeet, o texto já sai com vírgula e ponto.
- **Sem internet.** A voz vira texto no seu Mac. Nenhum áudio sai dele.
- **Nada se perde.** Se o texto não colar, aparece o cartão "Não colou?". Clique no campo certo e depois na linha: o texto cola ali, e o seu clipboard fica como estava.
- **Os últimos ditados à mão.** O menu da barra lista os cinco últimos.
- **Troca exata de palavras.** Se o modelo ouve "Jev" quando você diz "dev", uma regra resolve: ouço X, escrevo Y.
- **Histórico do clipboard.** Guarda o que você copia, só texto, com criptografia.

## Atalhos

| Atalho                                 | O que faz                        |
| -------------------------------------- | -------------------------------- |
| <kbd>⌥</kbd> <kbd>Espaço</kbd>         | Ditar (você pode trocar)         |
| <kbd>⌥</kbd> <kbd>⇧</kbd> <kbd>H</kbd> | Mostrar os cinco últimos ditados |
| <kbd>⌥</kbd> <kbd>⇧</kbd> <kbd>V</kbd> | Colar o último ditado de novo    |
| <kbd>⌘</kbd> <kbd>⇧</kbd> <kbd>V</kbd> | Abrir o histórico do clipboard   |

## Gostou?

Deixe uma estrela. Ela ajuda mais gente a achar o Escrevoz.

<a href="https://star-history.com/#LimaJoota/escrevoz&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=LimaJoota/escrevoz&type=Date&theme=dark">
    <img src="https://api.star-history.com/svg?repos=LimaJoota/escrevoz&type=Date" width="600" alt="Estrelas do Escrevoz ao longo do tempo">
  </picture>
</a>

## Créditos

O Escrevoz é baseado no [Handy](https://github.com/cjpais/Handy), de CJ Pais, sob a licença MIT. O reconhecimento de voz usa o transcribe.cpp e o [ggml](https://github.com/ggml-org/ggml). Para compilar do código, veja o [BUILD.md](BUILD.md).

## Licença

[MIT](LICENSE).
