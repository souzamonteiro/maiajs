# ECMAScript 2017 Grammar Summary (Annex A)

A gramática está dividida nas principais seções conforme a especificação: Gramática Léxica, Expressões, Declarações e Funções/Classes. Note que esta é uma versão simplificada e organizada para fins de clareza, omitindo alguns detalhes de nuance (como parâmetros de produção como `[Yield]`, `[Await]`, `[Return]`, `[In]` e regras semânticas estáticas) que são cruciais para uma implementação completa, mas que tornariam a gramática extremamente extensa.

### Convenções

*   `::=` : Define uma produção.
*   `|`  : Alternativa.
*   `[ ... ]` : Opcional.
*   `{ ... }` : Repetição (zero ou mais vezes).
*   `( ... )` : Agrupamento.
*   **`Terminal`** : Tokens terminais (geralmente em negrito ou entre aspas).
*   `Comment` : Produções para comentários (omitidas para brevidade).

---

## 1. Gramática Léxica (Lexical Grammar)

Define como os caracteres são agrupados em tokens.

```ebnf
SourceCharacter ::= ? any Unicode code point ? ;

// Elementos de Entrada
InputElementDiv ::= WhiteSpace | LineTerminator | Comment | CommonToken | DivPunctuator | RightBracePunctuator ;
InputElementRegExp ::= WhiteSpace | LineTerminator | Comment | CommonToken | RightBracePunctuator | RegularExpressionLiteral ;
InputElementRegExpOrTemplateTail ::= WhiteSpace | LineTerminator | Comment | CommonToken | RegularExpressionLiteral | TemplateSubstitutionTail ;
InputElementTemplateTail ::= WhiteSpace | LineTerminator | Comment | CommonToken | DivPunctuator | TemplateSubstitutionTail ;

// Espaço em Branco e Terminadores de Linha
WhiteSpace ::= '\t' | '\v' | '\f' | ' ' | '\u00A0' | '\uFEFF' | ? any Unicode "Space_Separator" ? ;
LineTerminator ::= '\n' | '\r' | '\u2028' | '\u2029' ;
LineTerminatorSequence ::= '\n' | '\r' | '\u2028' | '\u2029' | '\r\n' ;

// Tokens Comuns
CommonToken ::= IdentifierName | Punctuator | NumericLiteral | StringLiteral | Template ;

// Identificadores e Palavras Reservadas
IdentifierName ::= IdentifierStart | IdentifierName IdentifierPart ;
IdentifierStart ::= UnicodeIDStart | '$' | '_' | '\\' UnicodeEscapeSequence ;
IdentifierPart ::= UnicodeIDContinue | '$' | '_' | '\\' UnicodeEscapeSequence | '\u200C' | '\u200D' ;

UnicodeIDStart ::= ? any Unicode code point with the "ID_Start" property ? ;
UnicodeIDContinue ::= ? any Unicode code point with the "ID_Continue" property ? ;

ReservedWord ::= Keyword | FutureReservedWord | NullLiteral | BooleanLiteral ;

Keyword ::= 'await' | 'break' | 'case' | 'catch' | 'class' | 'const' | 'continue'
          | 'debugger' | 'default' | 'delete' | 'do' | 'else' | 'export' | 'extends'
          | 'finally' | 'for' | 'function' | 'if' | 'import' | 'in' | 'instanceof'
          | 'new' | 'return' | 'super' | 'switch' | 'this' | 'throw' | 'try' | 'typeof'
          | 'var' | 'void' | 'while' | 'with' | 'yield' ;

FutureReservedWord ::= 'enum' ;

// Pontuadores
Punctuator ::= '{' | '(' | ')' | '[' | ']' | '.' | '...' | ';' | ',' | '<' | '>' | '<=' | '>='
             | '==' | '!=' | '===' | '!==' | '+' | '-' | '*' | '%' | '**' | '++' | '--'
             | '<<' | '>>' | '>>>' | '&' | '|' | '^' | '!' | '~' | '&&' | '||' | '?'
             | ':' | '=' | '+=' | '-=' | '*=' | '%=' | '**=' | '<<=' | '>>=' | '>>>=' | '&='
             | '|=' | '^=' | '=>' ;

DivPunctuator ::= '/' | '/=' ;
RightBracePunctuator ::= '}' ;

// Literais
NullLiteral ::= 'null' ;
BooleanLiteral ::= 'true' | 'false' ;

NumericLiteral ::= DecimalLiteral | BinaryIntegerLiteral | OctalIntegerLiteral | HexIntegerLiteral ;

DecimalLiteral ::= DecimalIntegerLiteral '.' DecimalDigits? ExponentPart?
                 | '.' DecimalDigits ExponentPart?
                 | DecimalIntegerLiteral ExponentPart? ;

DecimalIntegerLiteral ::= '0' | NonZeroDigit DecimalDigits? ;
DecimalDigits ::= DecimalDigit | DecimalDigits DecimalDigit ;
DecimalDigit ::= '0'...'9' ;
NonZeroDigit ::= '1'...'9' ;
ExponentPart ::= ExponentIndicator SignedInteger ;
ExponentIndicator ::= 'e' | 'E' ;
SignedInteger ::= DecimalDigits | '+' DecimalDigits | '-' DecimalDigits ;

BinaryIntegerLiteral ::= '0b' BinaryDigits | '0B' BinaryDigits ;
BinaryDigits ::= BinaryDigit | BinaryDigits BinaryDigit ;
BinaryDigit ::= '0' | '1' ;

OctalIntegerLiteral ::= '0o' OctalDigits | '0O' OctalDigits ;
OctalDigits ::= OctalDigit | OctalDigits OctalDigit ;
OctalDigit ::= '0'...'7' ;

HexIntegerLiteral ::= '0x' HexDigits | '0X' HexDigits ;
HexDigits ::= HexDigit | HexDigits HexDigit ;
HexDigit ::= '0'...'9' | 'a'...'f' | 'A'...'F' ;

StringLiteral ::= '"' DoubleStringCharacters? '"' | "'" SingleStringCharacters? "'" ;
DoubleStringCharacters ::= DoubleStringCharacter | DoubleStringCharacters DoubleStringCharacter ;
SingleStringCharacters ::= SingleStringCharacter | SingleStringCharacters SingleStringCharacter ;

// Regras de Escape (simplificadas)
EscapeSequence ::= CharacterEscapeSequence | '0' | HexEscapeSequence | UnicodeEscapeSequence ;
CharacterEscapeSequence ::= SingleEscapeCharacter | NonEscapeCharacter ;
SingleEscapeCharacter ::= "'" | '"' | '\\' | 'b' | 'f' | 'n' | 'r' | 't' | 'v' ;
NonEscapeCharacter ::= SourceCharacter - (EscapeCharacter | LineTerminator) ;
HexEscapeSequence ::= 'x' HexDigit HexDigit ;
UnicodeEscapeSequence ::= 'u' Hex4Digits | 'u{' HexDigits '}' ;
Hex4Digits ::= HexDigit HexDigit HexDigit HexDigit ;

// Literal de Expressão Regular
RegularExpressionLiteral ::= '/' RegularExpressionBody '/' RegularExpressionFlags ;
// Corpo e Flags são definidos por uma gramática separada (Pattern)

// Literal Template
Template ::= NoSubstitutionTemplate | TemplateHead ;
NoSubstitutionTemplate ::= '`' TemplateCharacters? '`' ;
TemplateHead ::= '`' TemplateCharacters? '${' ;
TemplateSubstitutionTail ::= TemplateMiddle | TemplateTail ;
TemplateMiddle ::= '}' TemplateCharacters? '${' ;
TemplateTail ::= '}' TemplateCharacters? '`' ;
TemplateCharacters ::= TemplateCharacter | TemplateCharacters TemplateCharacter ;
TemplateCharacter ::= '$' (?! '{' ) | '\\' EscapeSequence | LineContinuation | LineTerminatorSequence | SourceCharacter - ('`' | '\\' | '$' | LineTerminator) ;
```

---

## 2. Gramática de Expressões (Expressions)

Define a sintaxe para expressões.

```ebnf
// Identificadores
IdentifierReference ::= Identifier | 'yield' | 'await' ;
BindingIdentifier ::= Identifier | 'yield' | 'await' ;
LabelIdentifier ::= Identifier | 'yield' | 'await' ;
Identifier ::= IdentifierName - ReservedWord ;

// Expressões Primárias
PrimaryExpression ::= 'this'
                    | IdentifierReference
                    | Literal
                    | ArrayLiteral
                    | ObjectLiteral
                    | FunctionExpression
                    | ClassExpression
                    | GeneratorExpression
                    | AsyncFunctionExpression
                    | RegularExpressionLiteral
                    | TemplateLiteral
                    | CoverParenthesizedExpressionAndArrowParameterList ;

Literal ::= NullLiteral | BooleanLiteral | NumericLiteral | StringLiteral ;

// Array Initializer
ArrayLiteral ::= '[' Elision? ']'
               | '[' ElementList ']'
               | '[' ElementList ',' Elision? ']' ;
ElementList ::= Elision? AssignmentExpression
              | Elision? SpreadElement
              | ElementList ',' Elision? AssignmentExpression
              | ElementList ',' Elision? SpreadElement ;
Elision ::= ',' | Elision ',' ;
SpreadElement ::= '...' AssignmentExpression ;

// Object Initializer
ObjectLiteral ::= '{' '}'
                | '{' PropertyDefinitionList '}'
                | '{' PropertyDefinitionList ',' '}' ;
PropertyDefinitionList ::= PropertyDefinition | PropertyDefinitionList ',' PropertyDefinition ;
PropertyDefinition ::= IdentifierReference
                     | CoverInitializedName
                     | PropertyName ':' AssignmentExpression
                     | MethodDefinition ;
PropertyName ::= LiteralPropertyName | ComputedPropertyName ;
LiteralPropertyName ::= IdentifierName | StringLiteral | NumericLiteral ;
ComputedPropertyName ::= '[' AssignmentExpression ']' ;
CoverInitializedName ::= IdentifierReference Initializer ;
Initializer ::= '=' AssignmentExpression ;

// Template Literal
TemplateLiteral ::= NoSubstitutionTemplate
                  | TemplateHead Expression TemplateSpans ;
TemplateSpans ::= TemplateTail
                | TemplateMiddleList TemplateTail ;
TemplateMiddleList ::= TemplateMiddle Expression
                     | TemplateMiddleList TemplateMiddle Expression ;

// Funções
FunctionExpression ::= 'function' BindingIdentifier? '(' FormalParameters ')' '{' FunctionBody '}' ;
GeneratorExpression ::= 'function' '*' BindingIdentifier? '(' FormalParameters ')' '{' GeneratorBody '}' ;
AsyncFunctionExpression ::= 'async' 'function' BindingIdentifier? '(' FormalParameters ')' '{' AsyncFunctionBody '}' ;

// Classes
ClassExpression ::= 'class' BindingIdentifier? ClassTail ;

// Membros e Chamadas
MemberExpression ::= PrimaryExpression
                    | MemberExpression '[' Expression ']'
                    | MemberExpression '.' IdentifierName
                    | MemberExpression TemplateLiteral
                    | SuperProperty
                    | MetaProperty
                    | 'new' MemberExpression Arguments ;

SuperProperty ::= 'super' '[' Expression ']' | 'super' '.' IdentifierName ;
MetaProperty ::= NewTarget ;
NewTarget ::= 'new' '.' 'target' ;

NewExpression ::= MemberExpression | 'new' NewExpression ;

CallExpression ::= CoverCallExpressionAndAsyncArrowHead
                  | SuperCall
                  | CallExpression Arguments
                  | CallExpression '[' Expression ']'
                  | CallExpression '.' IdentifierName
                  | CallExpression TemplateLiteral ;

SuperCall ::= 'super' Arguments ;

Arguments ::= '(' ')'
            | '(' ArgumentList ')'
            | '(' ArgumentList ',' ')' ;
ArgumentList ::= AssignmentExpression
               | '...' AssignmentExpression
               | ArgumentList ',' AssignmentExpression
               | ArgumentList ',' '...' AssignmentExpression ;

LeftHandSideExpression ::= NewExpression | CallExpression ;

// Atualização (Update)
UpdateExpression ::= LeftHandSideExpression
                   | LeftHandSideExpression '++'
                   | LeftHandSideExpression '--'
                   | '++' UnaryExpression
                   | '--' UnaryExpression ;

// Unários
UnaryExpression ::= UpdateExpression
                  | 'delete' UnaryExpression
                  | 'void' UnaryExpression
                  | 'typeof' UnaryExpression
                  | '+' UnaryExpression
                  | '-' UnaryExpression
                  | '~' UnaryExpression
                  | '!' UnaryExpression
                  | AwaitExpression ;

AwaitExpression ::= 'await' UnaryExpression ;

// Exponenciação
ExponentiationExpression ::= UnaryExpression
                            | UpdateExpression '**' ExponentiationExpression ;

// Multiplicativos, Aditivos, Shift
MultiplicativeExpression ::= ExponentiationExpression
                            | MultiplicativeExpression ('*' | '/' | '%') ExponentiationExpression ;

AdditiveExpression ::= MultiplicativeExpression
                      | AdditiveExpression '+' MultiplicativeExpression
                      | AdditiveExpression '-' MultiplicativeExpression ;

ShiftExpression ::= AdditiveExpression
                  | ShiftExpression ('<<' | '>>' | '>>>') AdditiveExpression ;

// Relacionais, Igualdade, Bitwise, Lógicos
RelationalExpression ::= ShiftExpression
                        | RelationalExpression ('<' | '>' | '<=' | '>=' | 'instanceof') ShiftExpression
                        | RelationalExpression 'in' ShiftExpression ;

EqualityExpression ::= RelationalExpression
                      | EqualityExpression ('==' | '!=' | '===' | '!==') RelationalExpression ;

BitwiseANDExpression ::= EqualityExpression | BitwiseANDExpression '&' EqualityExpression ;
BitwiseXORExpression ::= BitwiseANDExpression | BitwiseXORExpression '^' BitwiseANDExpression ;
BitwiseORExpression ::= BitwiseXORExpression | BitwiseORExpression '|' BitwiseXORExpression ;

LogicalANDExpression ::= BitwiseORExpression | LogicalANDExpression '&&' BitwiseORExpression ;
LogicalORExpression ::= LogicalANDExpression | LogicalORExpression '||' LogicalANDExpression ;

// Condicional
ConditionalExpression ::= LogicalORExpression
                         | LogicalORExpression '?' AssignmentExpression ':' AssignmentExpression ;

// Atribuição
AssignmentExpression ::= ConditionalExpression
                        | YieldExpression
                        | ArrowFunction
                        | AsyncArrowFunction
                        | LeftHandSideExpression '=' AssignmentExpression
                        | LeftHandSideExpression AssignmentOperator AssignmentExpression ;

AssignmentOperator ::= '*=' | '/=' | '%=' | '+=' | '-=' | '<<=' | '>>=' | '>>>=' | '&=' | '^=' | '|=' | '**=' ;

Expression ::= AssignmentExpression | Expression ',' AssignmentExpression ;

// Yield (para generators)
YieldExpression ::= 'yield'
                  | 'yield' AssignmentExpression
                  | 'yield' '*' AssignmentExpression ;
```

---

## 3. Gramática de Declarações e Statements

Define a sintaxe para blocos, comandos e declarações.

```ebnf
// Pontos de partida para Scripts e Módulos
Script ::= ScriptBody? ;
ScriptBody ::= StatementList ;

Module ::= ModuleBody? ;
ModuleBody ::= ModuleItemList ;

// Listas de Itens
StatementList ::= StatementListItem | StatementList StatementListItem ;
StatementListItem ::= Statement | Declaration ;

ModuleItemList ::= ModuleItem | ModuleItemList ModuleItem ;
ModuleItem ::= ImportDeclaration | ExportDeclaration | StatementListItem ;

// Declarações
Declaration ::= HoistableDeclaration | ClassDeclaration | LexicalDeclaration ;

HoistableDeclaration ::= FunctionDeclaration | GeneratorDeclaration | AsyncFunctionDeclaration ;

FunctionDeclaration ::= 'function' BindingIdentifier '(' FormalParameters ')' '{' FunctionBody '}'
                      | 'function' '(' FormalParameters ')' '{' FunctionBody '}' ;

GeneratorDeclaration ::= 'function' '*' BindingIdentifier '(' FormalParameters ')' '{' GeneratorBody '}'
                        | 'function' '*' '(' FormalParameters ')' '{' GeneratorBody '}' ;

AsyncFunctionDeclaration ::= 'async' 'function' BindingIdentifier '(' FormalParameters ')' '{' AsyncFunctionBody '}'
                            | 'async' 'function' '(' FormalParameters ')' '{' AsyncFunctionBody '}' ;

ClassDeclaration ::= 'class' BindingIdentifier ClassTail
                   | 'class' ClassTail ;

LexicalDeclaration ::= ('let' | 'const') BindingList ';' ;

BindingList ::= LexicalBinding | BindingList ',' LexicalBinding ;
LexicalBinding ::= BindingIdentifier Initializer? | BindingPattern Initializer ;

// Statements
Statement ::= BlockStatement
            | VariableStatement
            | EmptyStatement
            | ExpressionStatement
            | IfStatement
            | BreakableStatement
            | ContinueStatement
            | BreakStatement
            | ReturnStatement
            | WithStatement
            | LabelledStatement
            | ThrowStatement
            | TryStatement
            | DebuggerStatement ;

BlockStatement ::= Block ;
Block ::= '{' StatementList? '}' ;

VariableStatement ::= 'var' VariableDeclarationList ';' ;
VariableDeclarationList ::= VariableDeclaration | VariableDeclarationList ',' VariableDeclaration ;
VariableDeclaration ::= BindingIdentifier Initializer? | BindingPattern Initializer ;

EmptyStatement ::= ';' ;
ExpressionStatement ::= Expression ';' ;

IfStatement ::= 'if' '(' Expression ')' Statement 'else' Statement
               | 'if' '(' Expression ')' Statement ;

// Iteração
IterationStatement ::= 'do' Statement 'while' '(' Expression ')' ';'
                     | 'while' '(' Expression ')' Statement
                     | 'for' '(' Expression? ';' Expression? ';' Expression? ')' Statement
                     | 'for' '(' 'var' VariableDeclarationList ';' Expression? ';' Expression? ')' Statement
                     | 'for' '(' LexicalDeclaration Expression? ';' Expression? ')' Statement
                     | 'for' '(' LeftHandSideExpression 'in' Expression ')' Statement
                     | 'for' '(' 'var' ForBinding 'in' Expression ')' Statement
                     | 'for' '(' ForDeclaration 'in' Expression ')' Statement
                     | 'for' '(' LeftHandSideExpression 'of' AssignmentExpression ')' Statement
                     | 'for' '(' 'var' ForBinding 'of' AssignmentExpression ')' Statement
                     | 'for' '(' ForDeclaration 'of' AssignmentExpression ')' Statement ;

ForDeclaration ::= ('let' | 'const') ForBinding ;
ForBinding ::= BindingIdentifier | BindingPattern ;

ContinueStatement ::= 'continue' ';' | 'continue' LabelIdentifier ';' ;
BreakStatement ::= 'break' ';' | 'break' LabelIdentifier ';' ;
ReturnStatement ::= 'return' ';' | 'return' Expression ';' ;

WithStatement ::= 'with' '(' Expression ')' Statement ;

SwitchStatement ::= 'switch' '(' Expression ')' CaseBlock ;
CaseBlock ::= '{' CaseClauses? '}'
            | '{' CaseClauses? DefaultClause CaseClauses? '}' ;
CaseClauses ::= CaseClause | CaseClauses CaseClause ;
CaseClause ::= 'case' Expression ':' StatementList? ;
DefaultClause ::= 'default' ':' StatementList? ;

LabelledStatement ::= LabelIdentifier ':' LabelledItem ;
LabelledItem ::= Statement | FunctionDeclaration ;

ThrowStatement ::= 'throw' Expression ';' ;

TryStatement ::= 'try' Block Catch
                | 'try' Block Finally
                | 'try' Block Catch Finally ;
Catch ::= 'catch' '(' CatchParameter ')' Block ;
Finally ::= 'finally' Block ;
CatchParameter ::= BindingIdentifier | BindingPattern ;

DebuggerStatement ::= 'debugger' ';' ;
```

---

## 4. Gramática de Funções, Parâmetros e Classes

Define detalhes internos de funções, parâmetros e corpos.

```ebnf
FormalParameters ::= (FunctionRestParameter | FormalParameterList)?
                   | FormalParameterList ',' FunctionRestParameter ;
FormalParameterList ::= FormalParameter | FormalParameterList ',' FormalParameter ;
FormalParameter ::= BindingElement ;
FunctionRestParameter ::= BindingRestElement ;

FunctionBody ::= FunctionStatementList ;
FunctionStatementList ::= StatementList? ;

GeneratorBody ::= FunctionBody ;
AsyncFunctionBody ::= FunctionBody ;

// Métodos
MethodDefinition ::= PropertyName '(' UniqueFormalParameters ')' '{' FunctionBody '}'
                    | GeneratorMethod
                    | AsyncMethod
                    | 'get' PropertyName '(' ')' '{' FunctionBody '}'
                    | 'set' PropertyName '(' PropertySetParameterList ')' '{' FunctionBody '}' ;

GeneratorMethod ::= '*' PropertyName '(' UniqueFormalParameters ')' '{' GeneratorBody '}' ;
AsyncMethod ::= 'async' PropertyName '(' UniqueFormalParameters ')' '{' AsyncFunctionBody '}' ;
PropertySetParameterList ::= FormalParameter ;

UniqueFormalParameters ::= FormalParameters ;

// Arrow Functions
ArrowFunction ::= ArrowParameters '=>' ConciseBody ;
ArrowParameters ::= BindingIdentifier | CoverParenthesizedExpressionAndArrowParameterList ;
ConciseBody ::= AssignmentExpression | '{' FunctionBody '}' ;

AsyncArrowFunction ::= 'async' AsyncArrowBindingIdentifier '=>' AsyncConciseBody
                      | CoverCallExpressionAndAsyncArrowHead '=>' AsyncConciseBody ;
AsyncArrowBindingIdentifier ::= BindingIdentifier ;
AsyncConciseBody ::= AssignmentExpression | '{' AsyncFunctionBody '}' ;

// Classes
ClassTail ::= ClassHeritage? '{' ClassBody? '}' ;
ClassHeritage ::= 'extends' LeftHandSideExpression ;
ClassBody ::= ClassElementList ;
ClassElementList ::= ClassElement | ClassElementList ClassElement ;
ClassElement ::= MethodDefinition | 'static' MethodDefinition | ';' ;

// Binding Patterns (Destructuring)
BindingPattern ::= ObjectBindingPattern | ArrayBindingPattern ;
ObjectBindingPattern ::= '{' '}'
                       | '{' BindingPropertyList '}'
                       | '{' BindingPropertyList ',' '}' ;
BindingPropertyList ::= BindingProperty | BindingPropertyList ',' BindingProperty ;
BindingProperty ::= SingleNameBinding | PropertyName ':' BindingElement ;

ArrayBindingPattern ::= '[' Elision? BindingRestElement? ']'
                       | '[' BindingElementList ']'
                       | '[' BindingElementList ',' Elision? BindingRestElement? ']' ;
BindingElementList ::= BindingElisionElement | BindingElementList ',' BindingElisionElement ;
BindingElisionElement ::= Elision? BindingElement ;
BindingElement ::= SingleNameBinding | BindingPattern Initializer? ;
SingleNameBinding ::= BindingIdentifier Initializer? ;
BindingRestElement ::= '...' BindingIdentifier | '...' BindingPattern ;

// Assignment Patterns (Destructuring Assignment)
AssignmentPattern ::= ObjectAssignmentPattern | ArrayAssignmentPattern ;
ObjectAssignmentPattern ::= '{' '}' | '{' AssignmentPropertyList '}' | '{' AssignmentPropertyList ',' '}' ;
AssignmentPropertyList ::= AssignmentProperty | AssignmentPropertyList ',' AssignmentProperty ;
AssignmentProperty ::= IdentifierReference Initializer? | PropertyName ':' AssignmentElement ;

ArrayAssignmentPattern ::= '[' Elision? AssignmentRestElement? ']'
                          | '[' AssignmentElementList ']'
                          | '[' AssignmentElementList ',' Elision? AssignmentRestElement? ']' ;
AssignmentElementList ::= AssignmentElisionElement | AssignmentElementList ',' AssignmentElisionElement ;
AssignmentElisionElement ::= Elision? AssignmentElement ;
AssignmentElement ::= DestructuringAssignmentTarget Initializer? ;
AssignmentRestElement ::= '...' DestructuringAssignmentTarget ;
DestructuringAssignmentTarget ::= LeftHandSideExpression ;
```
