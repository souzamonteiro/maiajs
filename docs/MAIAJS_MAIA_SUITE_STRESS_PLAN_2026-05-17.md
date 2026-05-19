# MAIAJS Stress Plan for test.js vs MaiaCpp test.cpp (2026-05-17)

## Status atual (2026-05-19)

Todos os problemas críticos descritos neste plano foram resolvidos no pipeline atual.

Validação de aceite executada em 2026-05-19:

1. `node compiler/examples/test.js`:
  - `8. robust arrays battery: OK`
  - `ALL TESTS PASSED`
2. `bash compiler/examples/build_test_dist.sh` em MaiaJS:
  - sem `timeout`
  - sem `fallback`
  - sem `Compilation error`
  - `==> All steps OK`
3. `bash compiler/examples/build_test_dist.sh` em MaiaCpp:
  - `ALL TESTS PASSED`
  - `==> All steps OK`

Conclusão: critérios de aceite desta investigação foram atendidos no estado atual dos repositórios principais e no encadeamento por submódulos.

## 1. Objetivo

Garantir que `compiler/examples/test.js` seja equivalente em escopo ao teste completo de MaiaCpp (`maiacpp/compiler/examples/test.cpp`) e inclua bateria robusta de arrays inspirada em MaiaC (`maiac/compiler/examples/test.c`), sem redução de cobertura, com build estável em `compiler/examples/build_test_dist.sh`.

## 2. Alterações já aplicadas no teste JS

Arquivo atualizado: `compiler/examples/test.js`

- Mantida a base equivalente de MaiaCpp:
  - classes, construtor/método, dispatch por função, herança básica, operadores aritméticos/lógicos/bitwise, loops, stress de logging.
- Adicionada bateria robusta de arrays inspirada em MaiaC:
  - sort manual (bubble sort), busca e checksum em vetor.
  - matriz 3D `2x3x4`.
  - array de strings.
  - array de objetos (estrutura-like `x/y`).
  - matriz 2D com acumulação de diagonal.
- Ajustes de compatibilidade sintática já detectados:
  - renomeados métodos `get` e `set` para `getValue` e `setAt` (falha de parser com tokens reservados).

## 3. Reprodução dos problemas atuais

### 3.1 MaiaCpp baseline

Comando:

- `cd /Volumes/External_SSD/Documentos/Projects/maiacpp && bash compiler/examples/build_test_dist.sh`

Resultado:

- Sucesso completo.
- `ALL TESTS PASSED`.

### 3.2 MaiaJS pipeline

Comando:

- `cd /Volumes/External_SSD/Documentos/Projects/maiajs && bash compiler/examples/build_test_dist.sh`

Resultado observado:

- `webjs` transpila JS para C++.
- Na etapa `webcpp` (parse do C++ gerado), ocorre timeout:
  - `Parser timeout (180000ms) during Parser: ok`
  - fallback simples acionado.
- Após fallback, há falha de compilação no backend C:
  - `[webc] Compilation error: Unknown base symbol 'this' (C_getValue)`
- Em execuções mais longas, também foi observado OOM do Node durante o pipeline.

## 4. Diagnóstico técnico (evidências)

Arquivo gerado para inspeção: `compiler/examples/test.cpp` (gerado por webjs).

Problemas estruturais encontrados no C++ emitido:

1. Lowering incompleto de loops:
- presença de comentários de erro no C++ gerado, por exemplo:
  - `// [for loop with unexpected semicolon count: 1]`
- Isso indica perda de semântica de `for` no front-end MaiaJS.

2. Emissão C++ semanticamente inválida em arrays/objetos:
- `const void* size = array.length;`
- `lastPoint.x` e `lastPoint.y` em variável `void*`.
- Essas formas não são C++ válido para o backend atual.

3. Explosão de profundidade em array literal lowering:
- expressões altamente aninhadas com `__maia_arr_builder_push_value(...)` em cadeia.
- provável gatilho de custo alto/backtracking no parser Cpp.

4. Semântica alterada em funções de teste:
- `runCoutStressTests` gerado retorna `0` mesmo com condição de sucesso.
- sugere bug no lowering de comparação/retorno.

5. Lowering de classe/método inconsistente para backend C:
- erro explícito de símbolo base `this` na compilação (`C_getValue`).
- indica quebra no caminho MaiaJS C++ emitido -> MaiaCpp/webc (resolução de membros/receiver).

## 5. Classificação de causa por projeto

### MaiaJS (causa principal)

- Parser/gramática com tratamento inadequado de `get`/`set` como nomes de método (não accessor).
- Front-end/lowering de loops e member access (`.length`, `.x/.y`) sem representação de runtime adequada.
- Estratégia de geração de array literal muito profunda para consumo robusto no próximo estágio.

### MaiaCpp (causa secundária / robustez)

- Parser C++ não robusto para padrões extremamente aninhados gerados por MaiaJS.
- Necessário hardening de parse para evitar timeout em casos de expressão válida/gerada.

### MaiaC e MaiaWASM

- Sem evidência direta de falha nesta investigação.
- Não foi observado bloqueio originado neles neste fluxo específico.

## 6. Plano de correção detalhado (MaiaJS)

## Fase A - Parser/EBNF ECMAScript

1. Ajustar `grammar/EcmaScript.ebnf` para aceitar `get` e `set` como identificadores de método em `MethodDefinition` quando não forem acessores.
2. Regenerar parser (sem edição manual de gerados):
- gerar `grammar/EcmaScript.xml`
- gerar `compiler/ecmascript-parser.js`
- via `maiacc/bin/tREx.sh` conforme convenção local.
3. Adicionar fixtures específicos:
- classe com métodos chamados `get` e `set`.
- classe com métodos normais + accessor real para evitar regressão.

## Fase B - Lowering de laços e arrays

1. Corrigir lowering de `for (...)` para AST estável e emissão sem placeholders.
2. Corrigir lowering de arrays para evitar árvore de chamadas excessivamente aninhada:
- substituir construção recursiva por emissão incremental em statements intermediários.
3. Corrigir `.length` em array para runtime helper explícito (ex.: `__maia_arr_length`).
4. Corrigir acesso a objetos literais:
- não emitir `.x`/`.y` em `void*`.
- usar hooks runtime com getters/setters por chave ou estruturar tipo representável no backend.
5. Corrigir lowering de métodos de classe para backend C:
- garantir receiver explícito em vez de depender de `this` não resolvido no estágio C.
- adicionar fixtures com classe mínima (`constructor` + método getter) para validar compilação fim-a-fim.

## Fase C - Garantia de equivalência do teste

1. Validar `compiler/examples/test.js` com `node` puro para resultado de referência.
2. Rodar `bash compiler/examples/build_test_dist.sh` e exigir:
- sem timeout no parse C++ downstream.
- sem fallback simples.
- execução final do dist runner sem travamento.
3. Garantir que a seção `8. robust arrays battery` passe no runtime final.

## 7. Protocolo obrigatório de sincronização (suite Maia)

Aplicar estritamente nesta ordem:

1. MaiaCC
2. MaiaWASM
3. MaiaC
4. MaiaCpp
5. MaiaJS

Regras críticas:

- Nunca editar manualmente arquivos de parser gerados.
- Toda mudança de parser inicia no EBNF correspondente e é regenerada com tREx.

## 8. Critérios de aceite

1. `maiacpp/compiler/examples/build_test_dist.sh` segue verde.
2. `maiajs/compiler/examples/build_test_dist.sh` completa sem timeout/fallback.
3. `maiajs/compiler/examples/test.js` mantém escopo completo e bateria robusta de arrays.
4. Artefatos de parser regenerados e versionados corretamente.
5. Sem regressão nas suítes existentes.

## 9. Comandos de referência

- MaiaJS parser regen (ajustar se necessário ao script local):
  - `cd /Volumes/External_SSD/Documentos/Projects/maiajs`
  - `./maiacc/bin/tREx.sh --ebnf --to-xml ./grammar/EcmaScript.xml ./grammar/EcmaScript.ebnf ./compiler/ecmascript-parser.js`

- Build de validação MaiaJS:
  - `bash compiler/examples/build_test_dist.sh`

- Build de validação MaiaCpp:
  - `cd /Volumes/External_SSD/Documentos/Projects/maiacpp`
  - `bash compiler/examples/build_test_dist.sh`
