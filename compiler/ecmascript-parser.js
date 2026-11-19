class Lexer {
  constructor(input) {
    this.input = input;
    this.position = 0;
    this.tokens = [];
    this.charClassDepth = 0;
    this.templateDepth = 0;
    this.templateBraceDepthStack = [];
    this.tokenPatterns = [    { type: 'TOKEN__7B_', regex: /^\{/ },    { type: 'TOKEN__7D_', regex: /^\}/ },    { type: 'TOKEN_var', regex: /^var/ },    { type: 'TOKEN_let', regex: /^let/ },    { type: 'TOKEN_const', regex: /^const/ },    { type: 'TOKEN__2C_', regex: /^,/ },    { type: 'TOKEN__3D_', regex: /^=/ },    { type: 'TOKEN_yield', regex: /^yield/ },    { type: 'TOKEN__2A_', regex: /^\*/ },    { type: 'TOKEN__3D__3E_', regex: /^=>/ },    { type: 'TOKEN_async', regex: /^async/ },    { type: 'TOKEN__28_', regex: /^\(/ },    { type: 'TOKEN__29_', regex: /^\)/ },    { type: 'TOKEN__3F_', regex: /^\?/ },    { type: 'TOKEN__3A_', regex: /^:/ },    { type: 'TOKEN__7C__7C_', regex: /^\|\|/ },    { type: 'TOKEN__26__26_', regex: /^&&/ },    { type: 'TOKEN__7C_', regex: /^\|/ },    { type: 'TOKEN__5E_', regex: /^\^/ },    { type: 'TOKEN__26_', regex: /^&/ },    { type: 'TOKEN__3D__3D_', regex: /^==/ },    { type: 'TOKEN__21__3D_', regex: /^!=/ },    { type: 'TOKEN__3D__3D__3D_', regex: /^===/ },    { type: 'TOKEN__21__3D__3D_', regex: /^!==/ },    { type: 'TOKEN__3C_', regex: /^</ },    { type: 'TOKEN__3E_', regex: /^>/ },    { type: 'TOKEN__3C__3D_', regex: /^<=/ },    { type: 'TOKEN__3E__3D_', regex: /^>=/ },    { type: 'TOKEN_instanceof', regex: /^instanceof/ },    { type: 'TOKEN_in', regex: /^in/ },    { type: 'TOKEN__3C__3C_', regex: /^<</ },    { type: 'TOKEN__3E__3E_', regex: /^>>/ },    { type: 'TOKEN__3E__3E__3E_', regex: /^>>>/ },    { type: 'TOKEN__2B_', regex: /^\+/ },    { type: 'TOKEN__2D_', regex: /^-/ },    { type: 'TOKEN__2F_', regex: /^\// },    { type: 'TOKEN__25_', regex: /^%/ },    { type: 'TOKEN__2A__2A_', regex: /^\*\*/ },    { type: 'TOKEN_delete', regex: /^delete/ },    { type: 'TOKEN_void', regex: /^void/ },    { type: 'TOKEN_typeof', regex: /^typeof/ },    { type: 'TOKEN__2B__2B_', regex: /^\+\+/ },    { type: 'TOKEN__2D__2D_', regex: /^--/ },    { type: 'TOKEN__7E_', regex: /^~/ },    { type: 'TOKEN__21_', regex: /^!/ },    { type: 'TOKEN_await', regex: /^await/ },    { type: 'TOKEN_new', regex: /^new/ },    { type: 'TOKEN__5B_', regex: /^\[/ },    { type: 'TOKEN__5D_', regex: /^\]/ },    { type: 'TOKEN__2E_', regex: /^\./ },    { type: 'TOKEN_this', regex: /^this/ },    { type: 'TOKEN__2E__2E__2E_', regex: /^\.\.\./ },    { type: 'TOKEN_get', regex: /^get/ },    { type: 'TOKEN_set', regex: /^set/ },    { type: 'TOKEN_as', regex: /^as/ },    { type: 'TOKEN_from', regex: /^from/ },    { type: 'TOKEN_of', regex: /^of/ },    { type: 'TOKEN_static', regex: /^static/ },    { type: 'TOKEN_target', regex: /^target/ },    { type: 'TOKEN_function', regex: /^function/ },    { type: 'TOKEN_class', regex: /^class/ },    { type: 'TOKEN__3B_', regex: /^;/ },    { type: 'TOKEN__2A__3D_', regex: /^\*=/ },    { type: 'TOKEN__2F__3D_', regex: /^\/=/ },    { type: 'TOKEN__25__3D_', regex: /^%=/ },    { type: 'TOKEN__2A__2A__3D_', regex: /^\*\*=/ },    { type: 'TOKEN__2B__3D_', regex: /^\+=/ },    { type: 'TOKEN__2D__3D_', regex: /^-=/ },    { type: 'TOKEN__3C__3C__3D_', regex: /^<<=/ },    { type: 'TOKEN__3E__3E__3D_', regex: /^>>=/ },    { type: 'TOKEN__3E__3E__3E__3D_', regex: /^>>>=/ },    { type: 'TOKEN__26__3D_', regex: /^&=/ },    { type: 'TOKEN__5E__3D_', regex: /^\^=/ },    { type: 'TOKEN__7C__3D_', regex: /^\|=/ },    { type: 'TOKEN_if', regex: /^if/ },    { type: 'TOKEN_else', regex: /^else/ },    { type: 'TOKEN_do', regex: /^do/ },    { type: 'TOKEN_while', regex: /^while/ },    { type: 'TOKEN_for', regex: /^for/ },    { type: 'TOKEN_continue', regex: /^continue/ },    { type: 'TOKEN_break', regex: /^break/ },    { type: 'TOKEN_return', regex: /^return/ },    { type: 'TOKEN_with', regex: /^with/ },    { type: 'TOKEN_switch', regex: /^switch/ },    { type: 'TOKEN_case', regex: /^case/ },    { type: 'TOKEN_default', regex: /^default/ },    { type: 'TOKEN_throw', regex: /^throw/ },    { type: 'TOKEN_try', regex: /^try/ },    { type: 'TOKEN_catch', regex: /^catch/ },    { type: 'TOKEN_finally', regex: /^finally/ },    { type: 'TOKEN_debugger', regex: /^debugger/ },    { type: 'TOKEN_extends', regex: /^extends/ },    { type: 'TOKEN_super', regex: /^super/ },    { type: 'TOKEN_import', regex: /^import/ },    { type: 'TOKEN_export', regex: /^export/ },    { type: 'Identifier', regex: /^(?:(?:[\u0041-\u005a]|[\u0061-\u007a]|[\u00c0-\u00d6]|[\u00d8-\u00f6]|[\u00f8-\u00ff]|[\u0100-\u0131]|[\u0134-\u013e]|[\u0141-\u0148]|[\u014a-\u017e]|[\u0180-\u01c3]|[\u01cd-\u01f0]|[\u01f4-\u01f5]|[\u01fa-\u0217]|[\u0250-\u02a8]|[\u02bb-\u02c1]|Ά|[\u0388-\u038a]|Ό|[\u038e-\u03a1]|[\u03a3-\u03ce]|[\u03d0-\u03d6]|Ϛ|Ϝ|Ϟ|Ϡ|[\u03e2-\u03f3]|[\u0401-\u040c]|[\u040e-\u044f]|[\u0451-\u045c]|[\u045e-\u0481]|[\u0490-\u04c4]|[\u04c7-\u04c8]|[\u04cb-\u04cc]|[\u04d0-\u04eb]|[\u04ee-\u04f5]|[\u04f8-\u04f9]|[\u0531-\u0556]|ՙ|[\u0561-\u0586]|[\u05d0-\u05ea]|[\u05f0-\u05f2]|[\u0621-\u063a]|[\u0641-\u064a]|[\u0671-\u06b7]|[\u06ba-\u06be]|[\u06c0-\u06ce]|[\u06d0-\u06d3]|ە|[\u06e5-\u06e6]|[\u0905-\u0939]|ऽ|[\u0958-\u0961]|[\u0985-\u098c]|[\u098f-\u0990]|[\u0993-\u09a8]|[\u09aa-\u09b0]|ল|[\u09b6-\u09b9]|[\u09dc-\u09dd]|[\u09df-\u09e1]|[\u09f0-\u09f1]|[\u0a05-\u0a0a]|[\u0a0f-\u0a10]|[\u0a13-\u0a28]|[\u0a2a-\u0a30]|[\u0a32-\u0a33]|[\u0a35-\u0a36]|[\u0a38-\u0a39]|[\u0a59-\u0a5c]|ਫ਼|[\u0a72-\u0a74]|[\u0a85-\u0a8b]|ઍ|[\u0a8f-\u0a91]|[\u0a93-\u0aa8]|[\u0aaa-\u0ab0]|[\u0ab2-\u0ab3]|[\u0ab5-\u0ab9]|ઽ|ૠ|[\u0b05-\u0b0c]|[\u0b0f-\u0b10]|[\u0b13-\u0b28]|[\u0b2a-\u0b30]|[\u0b32-\u0b33]|[\u0b36-\u0b39]|ଽ|[\u0b5c-\u0b5d]|[\u0b5f-\u0b61]|[\u0b85-\u0b8a]|[\u0b8e-\u0b90]|[\u0b92-\u0b95]|[\u0b99-\u0b9a]|ஜ|[\u0b9e-\u0b9f]|[\u0ba3-\u0ba4]|[\u0ba8-\u0baa]|[\u0bae-\u0bb5]|[\u0bb7-\u0bb9]|[\u0c05-\u0c0c]|[\u0c0e-\u0c10]|[\u0c12-\u0c28]|[\u0c2a-\u0c33]|[\u0c35-\u0c39]|[\u0c60-\u0c61]|[\u0c85-\u0c8c]|[\u0c8e-\u0c90]|[\u0c92-\u0ca8]|[\u0caa-\u0cb3]|[\u0cb5-\u0cb9]|ೞ|[\u0ce0-\u0ce1]|[\u0d05-\u0d0c]|[\u0d0e-\u0d10]|[\u0d12-\u0d28]|[\u0d2a-\u0d39]|[\u0d60-\u0d61]|[\u0e01-\u0e2e]|ะ|[\u0e32-\u0e33]|[\u0e40-\u0e45]|[\u0e81-\u0e82]|ຄ|[\u0e87-\u0e88]|ຊ|ຍ|[\u0e94-\u0e97]|[\u0e99-\u0e9f]|[\u0ea1-\u0ea3]|ລ|ວ|[\u0eaa-\u0eab]|[\u0ead-\u0eae]|ະ|[\u0eb2-\u0eb3]|ຽ|[\u0ec0-\u0ec4]|[\u0f40-\u0f47]|[\u0f49-\u0f69]|[\u10a0-\u10c5]|[\u10d0-\u10f6]|ᄀ|[\u1102-\u1103]|[\u1105-\u1107]|ᄉ|[\u110b-\u110c]|[\u110e-\u1112]|ᄼ|ᄾ|ᅀ|ᅌ|ᅎ|ᅐ|[\u1154-\u1155]|ᅙ|[\u115f-\u1161]|ᅣ|ᅥ|ᅧ|ᅩ|[\u116d-\u116e]|[\u1172-\u1173]|ᅵ|ᆞ|ᆨ|ᆫ|[\u11ae-\u11af]|[\u11b7-\u11b8]|ᆺ|[\u11bc-\u11c2]|ᇫ|ᇰ|ᇹ|[\u1e00-\u1e9b]|[\u1ea0-\u1ef9]|[\u1f00-\u1f15]|[\u1f18-\u1f1d]|[\u1f20-\u1f45]|[\u1f48-\u1f4d]|[\u1f50-\u1f57]|Ὑ|Ὓ|Ὕ|[\u1f5f-\u1f7d]|[\u1f80-\u1fb4]|[\u1fb6-\u1fbc]|ι|[\u1fc2-\u1fc4]|[\u1fc6-\u1fcc]|[\u1fd0-\u1fd3]|[\u1fd6-\u1fdb]|[\u1fe0-\u1fec]|[\u1ff2-\u1ff4]|[\u1ff6-\u1ffc]|Ω|[\u212a-\u212b]|℮|[\u2180-\u2182]|[\u3041-\u3094]|[\u30a1-\u30fa]|[\u3105-\u312c]|[\uac00-\ud7a3]|[\u4e00-\u9fa5]|〇|[\u3021-\u3029])|\$|_|\\u[0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F])(?:(?:(?:(?:[\u0041-\u005a]|[\u0061-\u007a]|[\u00c0-\u00d6]|[\u00d8-\u00f6]|[\u00f8-\u00ff]|[\u0100-\u0131]|[\u0134-\u013e]|[\u0141-\u0148]|[\u014a-\u017e]|[\u0180-\u01c3]|[\u01cd-\u01f0]|[\u01f4-\u01f5]|[\u01fa-\u0217]|[\u0250-\u02a8]|[\u02bb-\u02c1]|Ά|[\u0388-\u038a]|Ό|[\u038e-\u03a1]|[\u03a3-\u03ce]|[\u03d0-\u03d6]|Ϛ|Ϝ|Ϟ|Ϡ|[\u03e2-\u03f3]|[\u0401-\u040c]|[\u040e-\u044f]|[\u0451-\u045c]|[\u045e-\u0481]|[\u0490-\u04c4]|[\u04c7-\u04c8]|[\u04cb-\u04cc]|[\u04d0-\u04eb]|[\u04ee-\u04f5]|[\u04f8-\u04f9]|[\u0531-\u0556]|ՙ|[\u0561-\u0586]|[\u05d0-\u05ea]|[\u05f0-\u05f2]|[\u0621-\u063a]|[\u0641-\u064a]|[\u0671-\u06b7]|[\u06ba-\u06be]|[\u06c0-\u06ce]|[\u06d0-\u06d3]|ە|[\u06e5-\u06e6]|[\u0905-\u0939]|ऽ|[\u0958-\u0961]|[\u0985-\u098c]|[\u098f-\u0990]|[\u0993-\u09a8]|[\u09aa-\u09b0]|ল|[\u09b6-\u09b9]|[\u09dc-\u09dd]|[\u09df-\u09e1]|[\u09f0-\u09f1]|[\u0a05-\u0a0a]|[\u0a0f-\u0a10]|[\u0a13-\u0a28]|[\u0a2a-\u0a30]|[\u0a32-\u0a33]|[\u0a35-\u0a36]|[\u0a38-\u0a39]|[\u0a59-\u0a5c]|ਫ਼|[\u0a72-\u0a74]|[\u0a85-\u0a8b]|ઍ|[\u0a8f-\u0a91]|[\u0a93-\u0aa8]|[\u0aaa-\u0ab0]|[\u0ab2-\u0ab3]|[\u0ab5-\u0ab9]|ઽ|ૠ|[\u0b05-\u0b0c]|[\u0b0f-\u0b10]|[\u0b13-\u0b28]|[\u0b2a-\u0b30]|[\u0b32-\u0b33]|[\u0b36-\u0b39]|ଽ|[\u0b5c-\u0b5d]|[\u0b5f-\u0b61]|[\u0b85-\u0b8a]|[\u0b8e-\u0b90]|[\u0b92-\u0b95]|[\u0b99-\u0b9a]|ஜ|[\u0b9e-\u0b9f]|[\u0ba3-\u0ba4]|[\u0ba8-\u0baa]|[\u0bae-\u0bb5]|[\u0bb7-\u0bb9]|[\u0c05-\u0c0c]|[\u0c0e-\u0c10]|[\u0c12-\u0c28]|[\u0c2a-\u0c33]|[\u0c35-\u0c39]|[\u0c60-\u0c61]|[\u0c85-\u0c8c]|[\u0c8e-\u0c90]|[\u0c92-\u0ca8]|[\u0caa-\u0cb3]|[\u0cb5-\u0cb9]|ೞ|[\u0ce0-\u0ce1]|[\u0d05-\u0d0c]|[\u0d0e-\u0d10]|[\u0d12-\u0d28]|[\u0d2a-\u0d39]|[\u0d60-\u0d61]|[\u0e01-\u0e2e]|ะ|[\u0e32-\u0e33]|[\u0e40-\u0e45]|[\u0e81-\u0e82]|ຄ|[\u0e87-\u0e88]|ຊ|ຍ|[\u0e94-\u0e97]|[\u0e99-\u0e9f]|[\u0ea1-\u0ea3]|ລ|ວ|[\u0eaa-\u0eab]|[\u0ead-\u0eae]|ະ|[\u0eb2-\u0eb3]|ຽ|[\u0ec0-\u0ec4]|[\u0f40-\u0f47]|[\u0f49-\u0f69]|[\u10a0-\u10c5]|[\u10d0-\u10f6]|ᄀ|[\u1102-\u1103]|[\u1105-\u1107]|ᄉ|[\u110b-\u110c]|[\u110e-\u1112]|ᄼ|ᄾ|ᅀ|ᅌ|ᅎ|ᅐ|[\u1154-\u1155]|ᅙ|[\u115f-\u1161]|ᅣ|ᅥ|ᅧ|ᅩ|[\u116d-\u116e]|[\u1172-\u1173]|ᅵ|ᆞ|ᆨ|ᆫ|[\u11ae-\u11af]|[\u11b7-\u11b8]|ᆺ|[\u11bc-\u11c2]|ᇫ|ᇰ|ᇹ|[\u1e00-\u1e9b]|[\u1ea0-\u1ef9]|[\u1f00-\u1f15]|[\u1f18-\u1f1d]|[\u1f20-\u1f45]|[\u1f48-\u1f4d]|[\u1f50-\u1f57]|Ὑ|Ὓ|Ὕ|[\u1f5f-\u1f7d]|[\u1f80-\u1fb4]|[\u1fb6-\u1fbc]|ι|[\u1fc2-\u1fc4]|[\u1fc6-\u1fcc]|[\u1fd0-\u1fd3]|[\u1fd6-\u1fdb]|[\u1fe0-\u1fec]|[\u1ff2-\u1ff4]|[\u1ff6-\u1ffc]|Ω|[\u212a-\u212b]|℮|[\u2180-\u2182]|[\u3041-\u3094]|[\u30a1-\u30fa]|[\u3105-\u312c]|[\uac00-\ud7a3]|[\u4e00-\u9fa5]|〇|[\u3021-\u3029])|\$|_|\\u[0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F])|(?:[\u0300-\u0345]|[\u0360-\u0361]|[\u0483-\u0486]|[\u0591-\u05a1]|[\u05a3-\u05b9]|[\u05bb-\u05bd]|ֿ|[\u05c1-\u05c2]|ׄ|[\u064b-\u0652]|ٰ|[\u06d6-\u06dc]|[\u06dd-\u06df]|[\u06e0-\u06e4]|[\u06e7-\u06e8]|[\u06ea-\u06ed]|[\u0901-\u0903]|़|[\u093e-\u094c]|्|[\u0951-\u0954]|[\u0962-\u0963]|[\u0981-\u0983]|়|া|ি|[\u09c0-\u09c4]|[\u09c7-\u09c8]|[\u09cb-\u09cd]|ৗ|[\u09e2-\u09e3]|ਂ|਼|ਾ|ਿ|[\u0a40-\u0a42]|[\u0a47-\u0a48]|[\u0a4b-\u0a4d]|[\u0a70-\u0a71]|[\u0a81-\u0a83]|઼|[\u0abe-\u0ac5]|[\u0ac7-\u0ac9]|[\u0acb-\u0acd]|[\u0b01-\u0b03]|଼|[\u0b3e-\u0b43]|[\u0b47-\u0b48]|[\u0b4b-\u0b4d]|[\u0b56-\u0b57]|[\u0b82-\u0b83]|[\u0bbe-\u0bc2]|[\u0bc6-\u0bc8]|[\u0bca-\u0bcd]|ௗ|[\u0c01-\u0c03]|[\u0c3e-\u0c44]|[\u0c46-\u0c48]|[\u0c4a-\u0c4d]|[\u0c55-\u0c56]|[\u0c82-\u0c83]|[\u0cbe-\u0cc4]|[\u0cc6-\u0cc8]|[\u0cca-\u0ccd]|[\u0cd5-\u0cd6]|[\u0d02-\u0d03]|[\u0d3e-\u0d43]|[\u0d46-\u0d48]|[\u0d4a-\u0d4d]|ൗ|ั|[\u0e34-\u0e3a]|[\u0e47-\u0e4e]|ັ|[\u0eb4-\u0eb9]|[\u0ebb-\u0ebc]|[\u0ec8-\u0ecd]|[\u0f18-\u0f19]|༵|༷|༹|༾|༿|[\u0f71-\u0f84]|[\u0f86-\u0f8b]|[\u0f90-\u0f95]|ྗ|[\u0f99-\u0fad]|[\u0fb1-\u0fb7]|ྐྵ|[\u20d0-\u20dc]|⃡|[\u302a-\u302f]|゙|゚)|(?:[\u0030-\u0039]|[\u0660-\u0669]|[\u06f0-\u06f9]|[\u0966-\u096f]|[\u09e6-\u09ef]|[\u0a66-\u0a6f]|[\u0ae6-\u0aef]|[\u0b66-\u0b6f]|[\u0be7-\u0bef]|[\u0c66-\u0c6f]|[\u0ce6-\u0cef]|[\u0d66-\u0d6f]|[\u0e50-\u0e59]|[\u0ed0-\u0ed9]|[\u0f20-\u0f29])|(?:·|ː|ˑ|·|ـ|ๆ|ໆ|々|[\u3031-\u3035]|[\u309d-\u309e]|[\u30fc-\u30fe])|‌|‍))*/ },    { type: 'IdentifierName', regex: /^(?:(?:[\u0041-\u005a]|[\u0061-\u007a]|[\u00c0-\u00d6]|[\u00d8-\u00f6]|[\u00f8-\u00ff]|[\u0100-\u0131]|[\u0134-\u013e]|[\u0141-\u0148]|[\u014a-\u017e]|[\u0180-\u01c3]|[\u01cd-\u01f0]|[\u01f4-\u01f5]|[\u01fa-\u0217]|[\u0250-\u02a8]|[\u02bb-\u02c1]|Ά|[\u0388-\u038a]|Ό|[\u038e-\u03a1]|[\u03a3-\u03ce]|[\u03d0-\u03d6]|Ϛ|Ϝ|Ϟ|Ϡ|[\u03e2-\u03f3]|[\u0401-\u040c]|[\u040e-\u044f]|[\u0451-\u045c]|[\u045e-\u0481]|[\u0490-\u04c4]|[\u04c7-\u04c8]|[\u04cb-\u04cc]|[\u04d0-\u04eb]|[\u04ee-\u04f5]|[\u04f8-\u04f9]|[\u0531-\u0556]|ՙ|[\u0561-\u0586]|[\u05d0-\u05ea]|[\u05f0-\u05f2]|[\u0621-\u063a]|[\u0641-\u064a]|[\u0671-\u06b7]|[\u06ba-\u06be]|[\u06c0-\u06ce]|[\u06d0-\u06d3]|ە|[\u06e5-\u06e6]|[\u0905-\u0939]|ऽ|[\u0958-\u0961]|[\u0985-\u098c]|[\u098f-\u0990]|[\u0993-\u09a8]|[\u09aa-\u09b0]|ল|[\u09b6-\u09b9]|[\u09dc-\u09dd]|[\u09df-\u09e1]|[\u09f0-\u09f1]|[\u0a05-\u0a0a]|[\u0a0f-\u0a10]|[\u0a13-\u0a28]|[\u0a2a-\u0a30]|[\u0a32-\u0a33]|[\u0a35-\u0a36]|[\u0a38-\u0a39]|[\u0a59-\u0a5c]|ਫ਼|[\u0a72-\u0a74]|[\u0a85-\u0a8b]|ઍ|[\u0a8f-\u0a91]|[\u0a93-\u0aa8]|[\u0aaa-\u0ab0]|[\u0ab2-\u0ab3]|[\u0ab5-\u0ab9]|ઽ|ૠ|[\u0b05-\u0b0c]|[\u0b0f-\u0b10]|[\u0b13-\u0b28]|[\u0b2a-\u0b30]|[\u0b32-\u0b33]|[\u0b36-\u0b39]|ଽ|[\u0b5c-\u0b5d]|[\u0b5f-\u0b61]|[\u0b85-\u0b8a]|[\u0b8e-\u0b90]|[\u0b92-\u0b95]|[\u0b99-\u0b9a]|ஜ|[\u0b9e-\u0b9f]|[\u0ba3-\u0ba4]|[\u0ba8-\u0baa]|[\u0bae-\u0bb5]|[\u0bb7-\u0bb9]|[\u0c05-\u0c0c]|[\u0c0e-\u0c10]|[\u0c12-\u0c28]|[\u0c2a-\u0c33]|[\u0c35-\u0c39]|[\u0c60-\u0c61]|[\u0c85-\u0c8c]|[\u0c8e-\u0c90]|[\u0c92-\u0ca8]|[\u0caa-\u0cb3]|[\u0cb5-\u0cb9]|ೞ|[\u0ce0-\u0ce1]|[\u0d05-\u0d0c]|[\u0d0e-\u0d10]|[\u0d12-\u0d28]|[\u0d2a-\u0d39]|[\u0d60-\u0d61]|[\u0e01-\u0e2e]|ะ|[\u0e32-\u0e33]|[\u0e40-\u0e45]|[\u0e81-\u0e82]|ຄ|[\u0e87-\u0e88]|ຊ|ຍ|[\u0e94-\u0e97]|[\u0e99-\u0e9f]|[\u0ea1-\u0ea3]|ລ|ວ|[\u0eaa-\u0eab]|[\u0ead-\u0eae]|ະ|[\u0eb2-\u0eb3]|ຽ|[\u0ec0-\u0ec4]|[\u0f40-\u0f47]|[\u0f49-\u0f69]|[\u10a0-\u10c5]|[\u10d0-\u10f6]|ᄀ|[\u1102-\u1103]|[\u1105-\u1107]|ᄉ|[\u110b-\u110c]|[\u110e-\u1112]|ᄼ|ᄾ|ᅀ|ᅌ|ᅎ|ᅐ|[\u1154-\u1155]|ᅙ|[\u115f-\u1161]|ᅣ|ᅥ|ᅧ|ᅩ|[\u116d-\u116e]|[\u1172-\u1173]|ᅵ|ᆞ|ᆨ|ᆫ|[\u11ae-\u11af]|[\u11b7-\u11b8]|ᆺ|[\u11bc-\u11c2]|ᇫ|ᇰ|ᇹ|[\u1e00-\u1e9b]|[\u1ea0-\u1ef9]|[\u1f00-\u1f15]|[\u1f18-\u1f1d]|[\u1f20-\u1f45]|[\u1f48-\u1f4d]|[\u1f50-\u1f57]|Ὑ|Ὓ|Ὕ|[\u1f5f-\u1f7d]|[\u1f80-\u1fb4]|[\u1fb6-\u1fbc]|ι|[\u1fc2-\u1fc4]|[\u1fc6-\u1fcc]|[\u1fd0-\u1fd3]|[\u1fd6-\u1fdb]|[\u1fe0-\u1fec]|[\u1ff2-\u1ff4]|[\u1ff6-\u1ffc]|Ω|[\u212a-\u212b]|℮|[\u2180-\u2182]|[\u3041-\u3094]|[\u30a1-\u30fa]|[\u3105-\u312c]|[\uac00-\ud7a3]|[\u4e00-\u9fa5]|〇|[\u3021-\u3029])|\$|_|\\u[0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F])(?:(?:(?:(?:[\u0041-\u005a]|[\u0061-\u007a]|[\u00c0-\u00d6]|[\u00d8-\u00f6]|[\u00f8-\u00ff]|[\u0100-\u0131]|[\u0134-\u013e]|[\u0141-\u0148]|[\u014a-\u017e]|[\u0180-\u01c3]|[\u01cd-\u01f0]|[\u01f4-\u01f5]|[\u01fa-\u0217]|[\u0250-\u02a8]|[\u02bb-\u02c1]|Ά|[\u0388-\u038a]|Ό|[\u038e-\u03a1]|[\u03a3-\u03ce]|[\u03d0-\u03d6]|Ϛ|Ϝ|Ϟ|Ϡ|[\u03e2-\u03f3]|[\u0401-\u040c]|[\u040e-\u044f]|[\u0451-\u045c]|[\u045e-\u0481]|[\u0490-\u04c4]|[\u04c7-\u04c8]|[\u04cb-\u04cc]|[\u04d0-\u04eb]|[\u04ee-\u04f5]|[\u04f8-\u04f9]|[\u0531-\u0556]|ՙ|[\u0561-\u0586]|[\u05d0-\u05ea]|[\u05f0-\u05f2]|[\u0621-\u063a]|[\u0641-\u064a]|[\u0671-\u06b7]|[\u06ba-\u06be]|[\u06c0-\u06ce]|[\u06d0-\u06d3]|ە|[\u06e5-\u06e6]|[\u0905-\u0939]|ऽ|[\u0958-\u0961]|[\u0985-\u098c]|[\u098f-\u0990]|[\u0993-\u09a8]|[\u09aa-\u09b0]|ল|[\u09b6-\u09b9]|[\u09dc-\u09dd]|[\u09df-\u09e1]|[\u09f0-\u09f1]|[\u0a05-\u0a0a]|[\u0a0f-\u0a10]|[\u0a13-\u0a28]|[\u0a2a-\u0a30]|[\u0a32-\u0a33]|[\u0a35-\u0a36]|[\u0a38-\u0a39]|[\u0a59-\u0a5c]|ਫ਼|[\u0a72-\u0a74]|[\u0a85-\u0a8b]|ઍ|[\u0a8f-\u0a91]|[\u0a93-\u0aa8]|[\u0aaa-\u0ab0]|[\u0ab2-\u0ab3]|[\u0ab5-\u0ab9]|ઽ|ૠ|[\u0b05-\u0b0c]|[\u0b0f-\u0b10]|[\u0b13-\u0b28]|[\u0b2a-\u0b30]|[\u0b32-\u0b33]|[\u0b36-\u0b39]|ଽ|[\u0b5c-\u0b5d]|[\u0b5f-\u0b61]|[\u0b85-\u0b8a]|[\u0b8e-\u0b90]|[\u0b92-\u0b95]|[\u0b99-\u0b9a]|ஜ|[\u0b9e-\u0b9f]|[\u0ba3-\u0ba4]|[\u0ba8-\u0baa]|[\u0bae-\u0bb5]|[\u0bb7-\u0bb9]|[\u0c05-\u0c0c]|[\u0c0e-\u0c10]|[\u0c12-\u0c28]|[\u0c2a-\u0c33]|[\u0c35-\u0c39]|[\u0c60-\u0c61]|[\u0c85-\u0c8c]|[\u0c8e-\u0c90]|[\u0c92-\u0ca8]|[\u0caa-\u0cb3]|[\u0cb5-\u0cb9]|ೞ|[\u0ce0-\u0ce1]|[\u0d05-\u0d0c]|[\u0d0e-\u0d10]|[\u0d12-\u0d28]|[\u0d2a-\u0d39]|[\u0d60-\u0d61]|[\u0e01-\u0e2e]|ะ|[\u0e32-\u0e33]|[\u0e40-\u0e45]|[\u0e81-\u0e82]|ຄ|[\u0e87-\u0e88]|ຊ|ຍ|[\u0e94-\u0e97]|[\u0e99-\u0e9f]|[\u0ea1-\u0ea3]|ລ|ວ|[\u0eaa-\u0eab]|[\u0ead-\u0eae]|ະ|[\u0eb2-\u0eb3]|ຽ|[\u0ec0-\u0ec4]|[\u0f40-\u0f47]|[\u0f49-\u0f69]|[\u10a0-\u10c5]|[\u10d0-\u10f6]|ᄀ|[\u1102-\u1103]|[\u1105-\u1107]|ᄉ|[\u110b-\u110c]|[\u110e-\u1112]|ᄼ|ᄾ|ᅀ|ᅌ|ᅎ|ᅐ|[\u1154-\u1155]|ᅙ|[\u115f-\u1161]|ᅣ|ᅥ|ᅧ|ᅩ|[\u116d-\u116e]|[\u1172-\u1173]|ᅵ|ᆞ|ᆨ|ᆫ|[\u11ae-\u11af]|[\u11b7-\u11b8]|ᆺ|[\u11bc-\u11c2]|ᇫ|ᇰ|ᇹ|[\u1e00-\u1e9b]|[\u1ea0-\u1ef9]|[\u1f00-\u1f15]|[\u1f18-\u1f1d]|[\u1f20-\u1f45]|[\u1f48-\u1f4d]|[\u1f50-\u1f57]|Ὑ|Ὓ|Ὕ|[\u1f5f-\u1f7d]|[\u1f80-\u1fb4]|[\u1fb6-\u1fbc]|ι|[\u1fc2-\u1fc4]|[\u1fc6-\u1fcc]|[\u1fd0-\u1fd3]|[\u1fd6-\u1fdb]|[\u1fe0-\u1fec]|[\u1ff2-\u1ff4]|[\u1ff6-\u1ffc]|Ω|[\u212a-\u212b]|℮|[\u2180-\u2182]|[\u3041-\u3094]|[\u30a1-\u30fa]|[\u3105-\u312c]|[\uac00-\ud7a3]|[\u4e00-\u9fa5]|〇|[\u3021-\u3029])|\$|_|\\u[0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F])|(?:[\u0300-\u0345]|[\u0360-\u0361]|[\u0483-\u0486]|[\u0591-\u05a1]|[\u05a3-\u05b9]|[\u05bb-\u05bd]|ֿ|[\u05c1-\u05c2]|ׄ|[\u064b-\u0652]|ٰ|[\u06d6-\u06dc]|[\u06dd-\u06df]|[\u06e0-\u06e4]|[\u06e7-\u06e8]|[\u06ea-\u06ed]|[\u0901-\u0903]|़|[\u093e-\u094c]|्|[\u0951-\u0954]|[\u0962-\u0963]|[\u0981-\u0983]|়|া|ি|[\u09c0-\u09c4]|[\u09c7-\u09c8]|[\u09cb-\u09cd]|ৗ|[\u09e2-\u09e3]|ਂ|਼|ਾ|ਿ|[\u0a40-\u0a42]|[\u0a47-\u0a48]|[\u0a4b-\u0a4d]|[\u0a70-\u0a71]|[\u0a81-\u0a83]|઼|[\u0abe-\u0ac5]|[\u0ac7-\u0ac9]|[\u0acb-\u0acd]|[\u0b01-\u0b03]|଼|[\u0b3e-\u0b43]|[\u0b47-\u0b48]|[\u0b4b-\u0b4d]|[\u0b56-\u0b57]|[\u0b82-\u0b83]|[\u0bbe-\u0bc2]|[\u0bc6-\u0bc8]|[\u0bca-\u0bcd]|ௗ|[\u0c01-\u0c03]|[\u0c3e-\u0c44]|[\u0c46-\u0c48]|[\u0c4a-\u0c4d]|[\u0c55-\u0c56]|[\u0c82-\u0c83]|[\u0cbe-\u0cc4]|[\u0cc6-\u0cc8]|[\u0cca-\u0ccd]|[\u0cd5-\u0cd6]|[\u0d02-\u0d03]|[\u0d3e-\u0d43]|[\u0d46-\u0d48]|[\u0d4a-\u0d4d]|ൗ|ั|[\u0e34-\u0e3a]|[\u0e47-\u0e4e]|ັ|[\u0eb4-\u0eb9]|[\u0ebb-\u0ebc]|[\u0ec8-\u0ecd]|[\u0f18-\u0f19]|༵|༷|༹|༾|༿|[\u0f71-\u0f84]|[\u0f86-\u0f8b]|[\u0f90-\u0f95]|ྗ|[\u0f99-\u0fad]|[\u0fb1-\u0fb7]|ྐྵ|[\u20d0-\u20dc]|⃡|[\u302a-\u302f]|゙|゚)|(?:[\u0030-\u0039]|[\u0660-\u0669]|[\u06f0-\u06f9]|[\u0966-\u096f]|[\u09e6-\u09ef]|[\u0a66-\u0a6f]|[\u0ae6-\u0aef]|[\u0b66-\u0b6f]|[\u0be7-\u0bef]|[\u0c66-\u0c6f]|[\u0ce6-\u0cef]|[\u0d66-\u0d6f]|[\u0e50-\u0e59]|[\u0ed0-\u0ed9]|[\u0f20-\u0f29])|(?:·|ː|ˑ|·|ـ|ๆ|ໆ|々|[\u3031-\u3035]|[\u309d-\u309e]|[\u30fc-\u30fe])|‌|‍))*/ },    { type: 'StringLiteral', regex: /^(?:"(?:(?:(?:[\u0000-\u0009]|[\u000b-\u000c]|[\u000e-\u0021]|[\u0023-\u005b]|[\u005d-\u2027]|[\u202a-\uffff])|\\(?:(?:['"\\bfnrtv]|[^\n\r\u2028\u2029])|(?:[0-7]|[0-3][0-7]|[4-7][0-7]|[0-3][0-7][0-7])|x[0-9a-fA-F][0-9a-fA-F]|u[0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F])|\\(?:\u000d\u000a|\u000a|\u000d|\u2028|\u2029)))*"|'(?:(?:(?:[\u0000-\u0009]|[\u000b-\u000c]|[\u000e-\u0026]|[\u0028-\u005b]|[\u005d-\u2027]|[\u202a-\uffff])|\\(?:(?:['"\\bfnrtv]|[^\n\r\u2028\u2029])|(?:[0-7]|[0-3][0-7]|[4-7][0-7]|[0-3][0-7][0-7])|x[0-9a-fA-F][0-9a-fA-F]|u[0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F])|\\(?:\u000d\u000a|\u000a|\u000d|\u2028|\u2029)))*')/ },    { type: 'RegularExpressionLiteral', regex: /^\/(?:[\u0000-\u0009]|[\u000b-\u000c]|[\u000e-\u0029]|[\u002b-\u002e]|[\u0030-\u005a]|[\u005c-\u2027]|[\u202a-\uffff])(?:(?:[\u0000-\u0009]|[\u000b-\u000c]|[\u000e-\u0029]|[\u002b-\u002e]|[\u0030-\u005a]|[\u005c-\u2027]|[\u202a-\uffff]))*\/(?:(?:(?:(?:[\u0041-\u005a]|[\u0061-\u007a]|[\u00c0-\u00d6]|[\u00d8-\u00f6]|[\u00f8-\u00ff]|[\u0100-\u0131]|[\u0134-\u013e]|[\u0141-\u0148]|[\u014a-\u017e]|[\u0180-\u01c3]|[\u01cd-\u01f0]|[\u01f4-\u01f5]|[\u01fa-\u0217]|[\u0250-\u02a8]|[\u02bb-\u02c1]|Ά|[\u0388-\u038a]|Ό|[\u038e-\u03a1]|[\u03a3-\u03ce]|[\u03d0-\u03d6]|Ϛ|Ϝ|Ϟ|Ϡ|[\u03e2-\u03f3]|[\u0401-\u040c]|[\u040e-\u044f]|[\u0451-\u045c]|[\u045e-\u0481]|[\u0490-\u04c4]|[\u04c7-\u04c8]|[\u04cb-\u04cc]|[\u04d0-\u04eb]|[\u04ee-\u04f5]|[\u04f8-\u04f9]|[\u0531-\u0556]|ՙ|[\u0561-\u0586]|[\u05d0-\u05ea]|[\u05f0-\u05f2]|[\u0621-\u063a]|[\u0641-\u064a]|[\u0671-\u06b7]|[\u06ba-\u06be]|[\u06c0-\u06ce]|[\u06d0-\u06d3]|ە|[\u06e5-\u06e6]|[\u0905-\u0939]|ऽ|[\u0958-\u0961]|[\u0985-\u098c]|[\u098f-\u0990]|[\u0993-\u09a8]|[\u09aa-\u09b0]|ল|[\u09b6-\u09b9]|[\u09dc-\u09dd]|[\u09df-\u09e1]|[\u09f0-\u09f1]|[\u0a05-\u0a0a]|[\u0a0f-\u0a10]|[\u0a13-\u0a28]|[\u0a2a-\u0a30]|[\u0a32-\u0a33]|[\u0a35-\u0a36]|[\u0a38-\u0a39]|[\u0a59-\u0a5c]|ਫ਼|[\u0a72-\u0a74]|[\u0a85-\u0a8b]|ઍ|[\u0a8f-\u0a91]|[\u0a93-\u0aa8]|[\u0aaa-\u0ab0]|[\u0ab2-\u0ab3]|[\u0ab5-\u0ab9]|ઽ|ૠ|[\u0b05-\u0b0c]|[\u0b0f-\u0b10]|[\u0b13-\u0b28]|[\u0b2a-\u0b30]|[\u0b32-\u0b33]|[\u0b36-\u0b39]|ଽ|[\u0b5c-\u0b5d]|[\u0b5f-\u0b61]|[\u0b85-\u0b8a]|[\u0b8e-\u0b90]|[\u0b92-\u0b95]|[\u0b99-\u0b9a]|ஜ|[\u0b9e-\u0b9f]|[\u0ba3-\u0ba4]|[\u0ba8-\u0baa]|[\u0bae-\u0bb5]|[\u0bb7-\u0bb9]|[\u0c05-\u0c0c]|[\u0c0e-\u0c10]|[\u0c12-\u0c28]|[\u0c2a-\u0c33]|[\u0c35-\u0c39]|[\u0c60-\u0c61]|[\u0c85-\u0c8c]|[\u0c8e-\u0c90]|[\u0c92-\u0ca8]|[\u0caa-\u0cb3]|[\u0cb5-\u0cb9]|ೞ|[\u0ce0-\u0ce1]|[\u0d05-\u0d0c]|[\u0d0e-\u0d10]|[\u0d12-\u0d28]|[\u0d2a-\u0d39]|[\u0d60-\u0d61]|[\u0e01-\u0e2e]|ะ|[\u0e32-\u0e33]|[\u0e40-\u0e45]|[\u0e81-\u0e82]|ຄ|[\u0e87-\u0e88]|ຊ|ຍ|[\u0e94-\u0e97]|[\u0e99-\u0e9f]|[\u0ea1-\u0ea3]|ລ|ວ|[\u0eaa-\u0eab]|[\u0ead-\u0eae]|ະ|[\u0eb2-\u0eb3]|ຽ|[\u0ec0-\u0ec4]|[\u0f40-\u0f47]|[\u0f49-\u0f69]|[\u10a0-\u10c5]|[\u10d0-\u10f6]|ᄀ|[\u1102-\u1103]|[\u1105-\u1107]|ᄉ|[\u110b-\u110c]|[\u110e-\u1112]|ᄼ|ᄾ|ᅀ|ᅌ|ᅎ|ᅐ|[\u1154-\u1155]|ᅙ|[\u115f-\u1161]|ᅣ|ᅥ|ᅧ|ᅩ|[\u116d-\u116e]|[\u1172-\u1173]|ᅵ|ᆞ|ᆨ|ᆫ|[\u11ae-\u11af]|[\u11b7-\u11b8]|ᆺ|[\u11bc-\u11c2]|ᇫ|ᇰ|ᇹ|[\u1e00-\u1e9b]|[\u1ea0-\u1ef9]|[\u1f00-\u1f15]|[\u1f18-\u1f1d]|[\u1f20-\u1f45]|[\u1f48-\u1f4d]|[\u1f50-\u1f57]|Ὑ|Ὓ|Ὕ|[\u1f5f-\u1f7d]|[\u1f80-\u1fb4]|[\u1fb6-\u1fbc]|ι|[\u1fc2-\u1fc4]|[\u1fc6-\u1fcc]|[\u1fd0-\u1fd3]|[\u1fd6-\u1fdb]|[\u1fe0-\u1fec]|[\u1ff2-\u1ff4]|[\u1ff6-\u1ffc]|Ω|[\u212a-\u212b]|℮|[\u2180-\u2182]|[\u3041-\u3094]|[\u30a1-\u30fa]|[\u3105-\u312c]|[\uac00-\ud7a3]|[\u4e00-\u9fa5]|〇|[\u3021-\u3029])|\$|_|\\u[0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F])|(?:[\u0300-\u0345]|[\u0360-\u0361]|[\u0483-\u0486]|[\u0591-\u05a1]|[\u05a3-\u05b9]|[\u05bb-\u05bd]|ֿ|[\u05c1-\u05c2]|ׄ|[\u064b-\u0652]|ٰ|[\u06d6-\u06dc]|[\u06dd-\u06df]|[\u06e0-\u06e4]|[\u06e7-\u06e8]|[\u06ea-\u06ed]|[\u0901-\u0903]|़|[\u093e-\u094c]|्|[\u0951-\u0954]|[\u0962-\u0963]|[\u0981-\u0983]|়|া|ি|[\u09c0-\u09c4]|[\u09c7-\u09c8]|[\u09cb-\u09cd]|ৗ|[\u09e2-\u09e3]|ਂ|਼|ਾ|ਿ|[\u0a40-\u0a42]|[\u0a47-\u0a48]|[\u0a4b-\u0a4d]|[\u0a70-\u0a71]|[\u0a81-\u0a83]|઼|[\u0abe-\u0ac5]|[\u0ac7-\u0ac9]|[\u0acb-\u0acd]|[\u0b01-\u0b03]|଼|[\u0b3e-\u0b43]|[\u0b47-\u0b48]|[\u0b4b-\u0b4d]|[\u0b56-\u0b57]|[\u0b82-\u0b83]|[\u0bbe-\u0bc2]|[\u0bc6-\u0bc8]|[\u0bca-\u0bcd]|ௗ|[\u0c01-\u0c03]|[\u0c3e-\u0c44]|[\u0c46-\u0c48]|[\u0c4a-\u0c4d]|[\u0c55-\u0c56]|[\u0c82-\u0c83]|[\u0cbe-\u0cc4]|[\u0cc6-\u0cc8]|[\u0cca-\u0ccd]|[\u0cd5-\u0cd6]|[\u0d02-\u0d03]|[\u0d3e-\u0d43]|[\u0d46-\u0d48]|[\u0d4a-\u0d4d]|ൗ|ั|[\u0e34-\u0e3a]|[\u0e47-\u0e4e]|ັ|[\u0eb4-\u0eb9]|[\u0ebb-\u0ebc]|[\u0ec8-\u0ecd]|[\u0f18-\u0f19]|༵|༷|༹|༾|༿|[\u0f71-\u0f84]|[\u0f86-\u0f8b]|[\u0f90-\u0f95]|ྗ|[\u0f99-\u0fad]|[\u0fb1-\u0fb7]|ྐྵ|[\u20d0-\u20dc]|⃡|[\u302a-\u302f]|゙|゚)|(?:[\u0030-\u0039]|[\u0660-\u0669]|[\u06f0-\u06f9]|[\u0966-\u096f]|[\u09e6-\u09ef]|[\u0a66-\u0a6f]|[\u0ae6-\u0aef]|[\u0b66-\u0b6f]|[\u0be7-\u0bef]|[\u0c66-\u0c6f]|[\u0ce6-\u0cef]|[\u0d66-\u0d6f]|[\u0e50-\u0e59]|[\u0ed0-\u0ed9]|[\u0f20-\u0f29])|(?:·|ː|ˑ|·|ـ|ๆ|ໆ|々|[\u3031-\u3035]|[\u309d-\u309e]|[\u30fc-\u30fe])|‌|‍))*/ },    { type: 'NoSubstitutionTemplate', regex: /^`(?:(?:\$(?:[^{])|\\(?:(?:['"\\bfnrtv]|[^\n\r\u2028\u2029])|(?:[0-7]|[0-3][0-7]|[4-7][0-7]|[0-3][0-7][0-7])|x[0-9a-fA-F][0-9a-fA-F]|u[0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F])|\\(?:\u000d\u000a|\u000a|\u000d|\u2028|\u2029)|(?:\u000d\u000a|\u000a|\u000d|\u2028|\u2029)|(?:[^`\\$\n\r\u2028\u2029])))*`/ },    { type: 'TemplateHead', regex: /^`(?:(?:\$(?:[^{])|\\(?:(?:['"\\bfnrtv]|[^\n\r\u2028\u2029])|(?:[0-7]|[0-3][0-7]|[4-7][0-7]|[0-3][0-7][0-7])|x[0-9a-fA-F][0-9a-fA-F]|u[0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F])|\\(?:\u000d\u000a|\u000a|\u000d|\u2028|\u2029)|(?:\u000d\u000a|\u000a|\u000d|\u2028|\u2029)|(?:[^`\\$\n\r\u2028\u2029])))*\$\{/ },    { type: 'TemplateMiddle', regex: /^\}(?:(?:\$(?:[^{])|\\(?:(?:['"\\bfnrtv]|[^\n\r\u2028\u2029])|(?:[0-7]|[0-3][0-7]|[4-7][0-7]|[0-3][0-7][0-7])|x[0-9a-fA-F][0-9a-fA-F]|u[0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F])|\\(?:\u000d\u000a|\u000a|\u000d|\u2028|\u2029)|(?:\u000d\u000a|\u000a|\u000d|\u2028|\u2029)|(?:[^`\\$\n\r\u2028\u2029])))*\$\{/ },    { type: 'TemplateTail', regex: /^\}(?:(?:\$(?:[^{])|\\(?:(?:['"\\bfnrtv]|[^\n\r\u2028\u2029])|(?:[0-7]|[0-3][0-7]|[4-7][0-7]|[0-3][0-7][0-7])|x[0-9a-fA-F][0-9a-fA-F]|u[0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F])|\\(?:\u000d\u000a|\u000a|\u000d|\u2028|\u2029)|(?:\u000d\u000a|\u000a|\u000d|\u2028|\u2029)|(?:[^`\\$\n\r\u2028\u2029])))*`/ },    { type: 'DecimalLiteral', regex: /^(?:(?:0|[1-9](?:[0-9])*)\.(?:[0-9])*(?:[eE](?:[+-])?(?:[0-9])+)?|\.(?:[0-9])+(?:[eE](?:[+-])?(?:[0-9])+)?|(?:0|[1-9](?:[0-9])*)(?:[eE](?:[+-])?(?:[0-9])+)?)/ },    { type: 'HexIntegerLiteral', regex: /^0[xX](?:[0-9a-fA-F])+/ },    { type: 'BinaryIntegerLiteral', regex: /^0[bB](?:[0-1])+/ },    { type: 'OctalIntegerLiteral', regex: /^0[oO](?:[0-7])+/ },    { type: 'skip', regex: /^(?:[\u0009\u000A\u000D\u0020]+|\/\/[^\n]*\n?|\/\*(?!\s*ws\s*:)[\s\S]*?\*\/)+/, skip: true },    { type: 'skip', regex: /^(?:\/\*(?:(?:(?:[\s\S])|(?:\*(?:[\s\S]))))*\*\/|\/\/(?:(?:[\u0000-\u0009]|[\u000b-\u000c]|[\u000e-\u2027]|[\u202a-\uffff]))*)/, skip: true },    ];
  }

  isTemplateSpanPattern(pos, kind) {
    // Deterministic scan to avoid regex escaping issues in generated code.
    if (this.input[pos] !== '}') return false;
    const BACKTICK = String.fromCharCode(96);
    const max = Math.min(this.input.length, pos + 256);
    let i = pos + 1;
    while (i < max) {
      const ch = this.input[i];
      const next = this.input[i + 1];

      if (ch === '\\') {
        i += 2;
        continue;
      }

      if (ch === '$' && next === '{') {
        return kind === 'TemplateMiddle';
      }

      if (ch === BACKTICK) {
        return kind === 'TemplateTail';
      }

      i++;
    }
    return false;
  }

  enterTemplateSpan() {
    this.templateDepth++;
    this.templateBraceDepthStack.push(0);
  }

  exitTemplateSpan() {
    if (this.templateDepth > 0) {
      this.templateDepth--;
    }
    if (this.templateBraceDepthStack.length > 0) {
      this.templateBraceDepthStack.pop();
    }
  }

  currentTemplateBraceDepth() {
    return this.templateBraceDepthStack.length === 0
      ? 0
      : this.templateBraceDepthStack[this.templateBraceDepthStack.length - 1];
  }

  incrementTemplateBraceDepth() {
    if (this.templateBraceDepthStack.length > 0) {
      this.templateBraceDepthStack[this.templateBraceDepthStack.length - 1] += 1;
    }
  }

  decrementTemplateBraceDepth() {
    const index = this.templateBraceDepthStack.length - 1;
    if (index >= 0 && this.templateBraceDepthStack[index] > 0) {
      this.templateBraceDepthStack[index] -= 1;
    }
  }
  
  tokenize() {
    while (this.position < this.input.length) {
      let bestPattern = null;
      let bestMatch = null;
      const candidates = [];

      const isGenericNameType = (type) => (
        type === 'Name' || type === 'NameChar' || type === 'NameStartChar'
      );

      for (const pattern of this.tokenPatterns) {
        // Template spans are synthesized only when a closing brace ends the
        // active interpolation. Their raw patterns must not consume ordinary
        // braces from nested expressions.
        if (pattern.type === 'TemplateMiddle' || pattern.type === 'TemplateTail') {
          continue;
        }

        const regex = pattern.regex;
        const match = this.input.substring(this.position).match(regex);

        if (match && match.index === 0 && match[0].length > 0) {
          let effectivePattern = pattern;
          let effectiveMatch = match;
          // When parsing template expressions, disambiguate closing brace as template span boundary.
          if (this.templateDepth > 0
            && pattern.type === 'TOKEN__7D_'
            && this.currentTemplateBraceDepth() === 0) {
            if (this.isTemplateSpanPattern(this.position, 'TemplateMiddle')) {
              const templateMiddle = this.tokenPatterns.find((candidate) => candidate.type === 'TemplateMiddle');
              const templateMatch = templateMiddle
                ? this.input.substring(this.position).match(templateMiddle.regex)
                : null;
              if (templateMatch && templateMatch.index === 0 && templateMatch[0].length > 0) {
                effectivePattern = templateMiddle;
                effectiveMatch = templateMatch;
              }
            } else if (this.isTemplateSpanPattern(this.position, 'TemplateTail')) {
              const templateTail = this.tokenPatterns.find((candidate) => candidate.type === 'TemplateTail');
              const templateMatch = templateTail
                ? this.input.substring(this.position).match(templateTail.regex)
                : null;
              if (templateMatch && templateMatch.index === 0 && templateMatch[0].length > 0) {
                effectivePattern = templateTail;
                effectiveMatch = templateMatch;
              }
            }
          }

          candidates.push({ pattern: effectivePattern, match: effectiveMatch });
          if (!bestMatch
              || effectiveMatch[0].length > bestMatch[0].length
              || (effectiveMatch[0].length === bestMatch[0].length && effectivePattern.skip && !bestPattern.skip)
              || (effectiveMatch[0].length === bestMatch[0].length
                  && bestPattern
                  && isGenericNameType(bestPattern.type)
                  && !isGenericNameType(effectivePattern.type))) {
            bestPattern = effectivePattern;
            bestMatch = effectiveMatch;
          }
        }
      }

      // Inside character classes, prefer Char/CharCode/CharRange-like tokens
      // over generic global terminals such as '?>' that can overmatch.
      if (this.charClassDepth > 0 && candidates.length > 0) {
        const preferredTypes = new Set(['CharCodeRange', 'CharRange', 'CharCode', 'Char', 'TOKEN__5D_']);
        const preferred = candidates.filter(c => preferredTypes.has(c.pattern.type));
        if (preferred.length > 0) {
          let localBest = preferred[0];
          for (const c of preferred) {
            if (c.match[0].length > localBest.match[0].length) {
              localBest = c;
            }
          }
          bestPattern = localBest.pattern;
          bestMatch = localBest.match;
        }
      }

      // If current input starts with whitespace and a skip token is available,
      // prefer skipping whitespace first instead of consuming it as grammar data.
      if (candidates.length > 0 && /^\s/.test(this.input.substring(this.position, this.position + 1))) {
        const skipCandidates = candidates.filter(c => c.pattern.skip);
        if (skipCandidates.length > 0) {
          let localBest = skipCandidates[0];
          for (const c of skipCandidates) {
            if (c.match[0].length > localBest.match[0].length) {
              localBest = c;
            }
          }
          bestPattern = localBest.pattern;
          bestMatch = localBest.match;
        }
      }

      if (!bestMatch) {
        throw new Error(`Unexpected character at position ${this.position}: '${this.input[this.position]}'`);
      }

      if (!bestPattern.skip) {
        const matchedToken = {
          type: bestPattern.type,
          value: bestMatch[0],
          start: this.position,
          end: this.position + bestMatch[0].length
        };
        this.tokens.push(matchedToken);

        if (bestPattern.type === 'TOKEN__5B_' || bestPattern.type === 'TOKEN__5B__5E_') {
          this.charClassDepth++;
        } else if (bestPattern.type === 'TOKEN__5D_' && this.charClassDepth > 0) {
          this.charClassDepth--;
        } else if (bestPattern.type === 'TOKEN__7B_' && this.templateDepth > 0) {
          this.incrementTemplateBraceDepth();
        } else if (bestPattern.type === 'TOKEN__7D_' && this.templateDepth > 0) {
          this.decrementTemplateBraceDepth();
        } else if (bestPattern.type === 'TemplateHead') {
          this.enterTemplateSpan();
        } else if (bestPattern.type === 'TemplateTail') {
          this.exitTemplateSpan();
        }
      }

      this.position += bestMatch[0].length;
    }
    
    // Add EOF token
    this.tokens.push({
      type: 'EOF',
      value: '',
      start: this.position,
      end: this.position
    });
    
    return this.tokens;
  }
}

const __BACKTRACK_ERROR = new Error('Backtrack');

class Parser {
  constructor(input, eventHandler = null) {
    this.lexer = new Lexer(input);
    this.tokens = this.lexer.tokenize();
    this.position = 0;
    this.errors = [];
    this._lastError = null;
    this.eventHandler = eventHandler;
    this.failureMemo = new Set();
    this.successMemo = new Map();
    this._canMemoSuccess = !eventHandler || typeof eventHandler.appendNode === 'function';
  }
  
  peek(offset = 0) {
    return this.tokens[this.position + offset];
  }
  
  consume(expectedType) {
    const token = this.peek();
    if (!token || token.type !== expectedType) {
      const errObj = {
        expected: expectedType,
        found: token ? token.type : 'EOF',
        position: this.position
      };
      this._lastError = errObj;
      if (this.errors.length === 0 || this.position >= this.errors[this.errors.length - 1].position) {
        this.errors.length = 0;
        this.errors.push(errObj);
      }
      throw __BACKTRACK_ERROR;
    }
    if (this.eventHandler && typeof this.eventHandler.terminal === 'function') {
      this.eventHandler.terminal(expectedType, token.value, this.position);
    }
    this.position++;
    return token;
  }
  
  match(expectedType) {
    const token = this.peek();
    if (token && token.type === expectedType) {
      if (this.eventHandler && typeof this.eventHandler.terminal === 'function') {
        this.eventHandler.terminal(expectedType, token.value, this.position);
      }
      this.position++;
      return true;
    }
    return false;
  }

  consumeContextual(expectedType) {
    const token = this.peek();
    if (token && token.type === expectedType) {
      return this.consume(expectedType);
    }

    const pattern = this.lexer.tokenPatterns.find((candidate) => candidate.type === expectedType);
    const match = pattern && token ? token.value.match(pattern.regex) : null;
    if (!match || match.index !== 0 || match[0].length !== token.value.length) {
      const errObj = {
        expected: expectedType,
        found: token ? token.type : 'EOF',
        position: this.position
      };
      this._lastError = errObj;
      if (this.errors.length === 0 || this.position >= this.errors[this.errors.length - 1].position) {
        this.errors.length = 0;
        this.errors.push(errObj);
      }
      throw __BACKTRACK_ERROR;
    }

    if (this.eventHandler && typeof this.eventHandler.terminal === 'function') {
      this.eventHandler.terminal(token.type, token.value, this.position);
    }
    this.position++;
    return token;
  }

  markEventState() {
    if (this.eventHandler && typeof this.eventHandler.checkpoint === 'function') {
      return this.eventHandler.checkpoint();
    }
    return null;
  }

  restoreEventState(mark) {
    if (mark !== null && this.eventHandler && typeof this.eventHandler.restore === 'function') {
      this.eventHandler.restore(mark);
    }
  }
  
  getErrorMessage() {
    if (this.errors.length === 0) return 'No errors';
    const err = this.errors[0];
    return `Syntax error: expected ${err.expected}, got ${err.found}`;
  }
  parse() {
    const prevStackTraceLimit = Error.stackTraceLimit;
    Error.stackTraceLimit = 0;
    let result;
    let parseErr = null;
    try {
      result = this.parseprogram();
    } catch (e) {
      parseErr = e;
    } finally {
      Error.stackTraceLimit = prevStackTraceLimit;
    }
    if (parseErr !== null) {
      if (parseErr === __BACKTRACK_ERROR) {
        const err = this._lastError || this.errors[this.errors.length - 1];
        throw new Error(err ? `Expected '${err.expected}', got '${err.found}'` : this.getErrorMessage());
      }
      throw parseErr;
    }
    const next = this.peek();
    if (!next && this.position === this.tokens.length) {
      return result;
    }
    if (!next || next.type !== 'EOF') {
      throw new Error(`Unexpected token at end: ${next ? next.type : 'EOF(consumed)'}`);
    }
    return result;
  }
  parseprogram() {
    const __memoStart = this.position;
    const __memoKey = 'program@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('program', this.position);
    }
    let __ok = false;
    try {
    // Optional: try parsing shebang
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      try {
        this.parseshebang();
      } catch(e) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
    while (true) {
      const savePos = this.position;
      const saveMark = this.markEventState();
      try {
        this.parsesourceElement();
        if (this.position === savePos) break;
      } catch(e) {
        this.position = savePos;
        this.restoreEventState(saveMark);
        break;
      }
    }
    this.consume('EOF');

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('program', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('program', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsesourceElement() {
    const __memoStart = this.position;
    const __memoKey = 'sourceElement@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('sourceElement', this.position);
    }
    let __ok = false;
    try {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parsestatement();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parseimportDeclaration();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parseexportDeclaration();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      throw __BACKTRACK_ERROR;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('sourceElement', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('sourceElement', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsestatement() {
    const __memoStart = this.position;
    const __memoKey = 'statement@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('statement', this.position);
    }
    let __ok = false;
    try {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parsefunctionDeclaration();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parsegeneratorDeclaration();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parseasyncFunctionDeclaration();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parseclassDeclaration();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parseblock();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parsevariableStatement();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parseletDeclaration();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parseconstDeclaration();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parseemptyStatement();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parseexpressionStatement();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parseifStatement();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parseiterationStatement();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parsecontinueStatement();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parsebreakStatement();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parsereturnStatement();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parsewithStatement();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parselabelledStatement();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parseswitchStatement();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parsethrowStatement();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parsetryStatement();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parsedebuggerStatement();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      throw __BACKTRACK_ERROR;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('statement', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('statement', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parseblock() {
    const __memoStart = this.position;
    const __memoKey = 'block@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('block', this.position);
    }
    let __ok = false;
    try {
    this.consume('TOKEN__7B_');
    while (true) {
      const savePos = this.position;
      const saveMark = this.markEventState();
      try {
        this.parsestatement();
        if (this.position === savePos) break;
      } catch(e) {
        this.position = savePos;
        this.restoreEventState(saveMark);
        break;
      }
    }
    this.consume('TOKEN__7D_');

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('block', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('block', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsevariableStatement() {
    const __memoStart = this.position;
    const __memoKey = 'variableStatement@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('variableStatement', this.position);
    }
    let __ok = false;
    try {
    this.consume('TOKEN_var');
    this.parsevariableDeclarationList();
    this.parsesemicolon();

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('variableStatement', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('variableStatement', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parseletDeclaration() {
    const __memoStart = this.position;
    const __memoKey = 'letDeclaration@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('letDeclaration', this.position);
    }
    let __ok = false;
    try {
    this.consume('TOKEN_let');
    this.parsevariableDeclarationList();
    this.parsesemicolon();

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('letDeclaration', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('letDeclaration', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parseconstDeclaration() {
    const __memoStart = this.position;
    const __memoKey = 'constDeclaration@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('constDeclaration', this.position);
    }
    let __ok = false;
    try {
    this.consume('TOKEN_const');
    this.parsevariableDeclarationList();
    this.parsesemicolon();

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('constDeclaration', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('constDeclaration', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parselexicalDeclaration() {
    const __memoStart = this.position;
    const __memoKey = 'lexicalDeclaration@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('lexicalDeclaration', this.position);
    }
    let __ok = false;
    try {
    this.parseletOrConst();
    this.parsebindingList();
    this.parsesemicolon();

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('lexicalDeclaration', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('lexicalDeclaration', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parseletOrConst() {
    const __memoStart = this.position;
    const __memoKey = 'letOrConst@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('letOrConst', this.position);
    }
    let __ok = false;
    try {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN_let');
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN_const');
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      throw __BACKTRACK_ERROR;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('letOrConst', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('letOrConst', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsebindingList() {
    const __memoStart = this.position;
    const __memoKey = 'bindingList@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('bindingList', this.position);
    }
    let __ok = false;
    try {
    this.parselexicalBinding();
    // Group *
    while (true) {
      const _loopStart = this.position;
      const _loopMark = this.markEventState();
      try {
    this.consume('TOKEN__2C_');
    this.parselexicalBinding();
      } catch (e) {
        this.position = _loopStart;
        this.restoreEventState(_loopMark);
        break;
      }
      if (this.position === _loopStart) break;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('bindingList', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('bindingList', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parselexicalBinding() {
    const __memoStart = this.position;
    const __memoKey = 'lexicalBinding@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('lexicalBinding', this.position);
    }
    let __ok = false;
    try {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parsebindingIdentifier();
    // Optional: try parsing initializer
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      try {
        this.parseinitializer();
      } catch(e) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parsebindingPattern();
    this.parseinitializer();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      throw __BACKTRACK_ERROR;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('lexicalBinding', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('lexicalBinding', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsevariableDeclarationList() {
    const __memoStart = this.position;
    const __memoKey = 'variableDeclarationList@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('variableDeclarationList', this.position);
    }
    let __ok = false;
    try {
    this.parsevariableDeclaration();
    // Group *
    while (true) {
      const _loopStart = this.position;
      const _loopMark = this.markEventState();
      try {
    this.consume('TOKEN__2C_');
    this.parsevariableDeclaration();
      } catch (e) {
        this.position = _loopStart;
        this.restoreEventState(_loopMark);
        break;
      }
      if (this.position === _loopStart) break;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('variableDeclarationList', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('variableDeclarationList', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsevariableDeclaration() {
    const __memoStart = this.position;
    const __memoKey = 'variableDeclaration@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('variableDeclaration', this.position);
    }
    let __ok = false;
    try {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parsebindingIdentifier();
    // Optional: try parsing initializer
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      try {
        this.parseinitializer();
      } catch(e) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parsebindingPattern();
    // Optional: try parsing initializer
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      try {
        this.parseinitializer();
      } catch(e) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      throw __BACKTRACK_ERROR;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('variableDeclaration', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('variableDeclaration', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parseinitializer() {
    const __memoStart = this.position;
    const __memoKey = 'initializer@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('initializer', this.position);
    }
    let __ok = false;
    try {
    this.consume('TOKEN__3D_');
    this.parseassignmentExpression();

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('initializer', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('initializer', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parseassignmentExpression() {
    const __memoStart = this.position;
    const __memoKey = 'assignmentExpression@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('assignmentExpression', this.position);
    }
    let __ok = false;
    try {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parsearrowFunction();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parseasyncArrowFunction();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parsefunctionExpression();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parsegeneratorExpression();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parseasyncFunctionExpression();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parseyieldExpression();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parseleftHandSideExpression();
    this.parseassignmentOperator();
    this.parseassignmentExpression();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parseconditionalExpression();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      throw __BACKTRACK_ERROR;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('assignmentExpression', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('assignmentExpression', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parseyieldExpression() {
    const __memoStart = this.position;
    const __memoKey = 'yieldExpression@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('yieldExpression', this.position);
    }
    let __ok = false;
    try {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN_yield');
    this.consume('TOKEN__2A_');
    this.parseassignmentExpression();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN_yield');
    // Optional: try parsing assignmentExpression
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      try {
        this.parseassignmentExpression();
      } catch(e) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      throw __BACKTRACK_ERROR;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('yieldExpression', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('yieldExpression', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsearrowFunction() {
    const __memoStart = this.position;
    const __memoKey = 'arrowFunction@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('arrowFunction', this.position);
    }
    let __ok = false;
    try {
    this.parsearrowFunctionParameters();
    this.consume('TOKEN__3D__3E_');
    this.parsearrowFunctionBody();

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('arrowFunction', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('arrowFunction', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parseasyncArrowFunction() {
    const __memoStart = this.position;
    const __memoKey = 'asyncArrowFunction@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('asyncArrowFunction', this.position);
    }
    let __ok = false;
    try {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN_async');
    this.parseasyncArrowBindingIdentifier();
    this.consume('TOKEN__3D__3E_');
    this.parseasyncConciseBody();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN_async');
    this.consume('TOKEN__28_');
    // Optional: try parsing formalParameterList
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      try {
        this.parseformalParameterList();
      } catch(e) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
    this.consume('TOKEN__29_');
    this.consume('TOKEN__3D__3E_');
    this.parseasyncConciseBody();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parsecoverCallExpressionAndAsyncArrowHead();
    this.consume('TOKEN__3D__3E_');
    this.parseasyncConciseBody();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      throw __BACKTRACK_ERROR;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('asyncArrowFunction', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('asyncArrowFunction', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parseasyncArrowBindingIdentifier() {
    const __memoStart = this.position;
    const __memoKey = 'asyncArrowBindingIdentifier@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('asyncArrowBindingIdentifier', this.position);
    }
    let __ok = false;
    try {
    this.parsebindingIdentifier();

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('asyncArrowBindingIdentifier', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('asyncArrowBindingIdentifier', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsecoverCallExpressionAndAsyncArrowHead() {
    const __memoStart = this.position;
    const __memoKey = 'coverCallExpressionAndAsyncArrowHead@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('coverCallExpressionAndAsyncArrowHead', this.position);
    }
    let __ok = false;
    try {
    this.parsememberExpression();
    this.parsearguments();

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('coverCallExpressionAndAsyncArrowHead', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('coverCallExpressionAndAsyncArrowHead', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parseasyncConciseBody() {
    const __memoStart = this.position;
    const __memoKey = 'asyncConciseBody@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('asyncConciseBody', this.position);
    }
    let __ok = false;
    try {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parseassignmentExpression();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN__7B_');
    this.parseasyncFunctionBody();
    this.consume('TOKEN__7D_');
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      throw __BACKTRACK_ERROR;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('asyncConciseBody', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('asyncConciseBody', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsearrowFunctionParameters() {
    const __memoStart = this.position;
    const __memoKey = 'arrowFunctionParameters@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('arrowFunctionParameters', this.position);
    }
    let __ok = false;
    try {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parseidentifierReference();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN__28_');
    // Optional: try parsing formalParameterList
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      try {
        this.parseformalParameterList();
      } catch(e) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
    this.consume('TOKEN__29_');
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      throw __BACKTRACK_ERROR;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('arrowFunctionParameters', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('arrowFunctionParameters', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsearrowFunctionBody() {
    const __memoStart = this.position;
    const __memoKey = 'arrowFunctionBody@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('arrowFunctionBody', this.position);
    }
    let __ok = false;
    try {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parseassignmentExpression();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN__7B_');
    this.parsefunctionBody();
    this.consume('TOKEN__7D_');
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      throw __BACKTRACK_ERROR;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('arrowFunctionBody', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('arrowFunctionBody', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parseconditionalExpression() {
    const __memoStart = this.position;
    const __memoKey = 'conditionalExpression@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('conditionalExpression', this.position);
    }
    let __ok = false;
    try {
    this.parselogicalORExpression();
    // Group ?
    {
      const _optStart = this.position;
      const _optMark = this.markEventState();
      try {
    this.consume('TOKEN__3F_');
    this.parseassignmentExpression();
    this.consume('TOKEN__3A_');
    this.parseassignmentExpression();
      } catch (e) {
        this.position = _optStart;
        this.restoreEventState(_optMark);
      }
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('conditionalExpression', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('conditionalExpression', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parselogicalORExpression() {
    const __memoStart = this.position;
    const __memoKey = 'logicalORExpression@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('logicalORExpression', this.position);
    }
    let __ok = false;
    try {
    this.parselogicalANDExpression();
    // Group *
    while (true) {
      const _loopStart = this.position;
      const _loopMark = this.markEventState();
      try {
    this.consume('TOKEN__7C__7C_');
    this.parselogicalANDExpression();
      } catch (e) {
        this.position = _loopStart;
        this.restoreEventState(_loopMark);
        break;
      }
      if (this.position === _loopStart) break;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('logicalORExpression', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('logicalORExpression', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parselogicalANDExpression() {
    const __memoStart = this.position;
    const __memoKey = 'logicalANDExpression@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('logicalANDExpression', this.position);
    }
    let __ok = false;
    try {
    this.parsebitwiseORExpression();
    // Group *
    while (true) {
      const _loopStart = this.position;
      const _loopMark = this.markEventState();
      try {
    this.consume('TOKEN__26__26_');
    this.parsebitwiseORExpression();
      } catch (e) {
        this.position = _loopStart;
        this.restoreEventState(_loopMark);
        break;
      }
      if (this.position === _loopStart) break;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('logicalANDExpression', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('logicalANDExpression', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsebitwiseORExpression() {
    const __memoStart = this.position;
    const __memoKey = 'bitwiseORExpression@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('bitwiseORExpression', this.position);
    }
    let __ok = false;
    try {
    this.parsebitwiseXORExpression();
    // Group *
    while (true) {
      const _loopStart = this.position;
      const _loopMark = this.markEventState();
      try {
    this.consume('TOKEN__7C_');
    this.parsebitwiseXORExpression();
      } catch (e) {
        this.position = _loopStart;
        this.restoreEventState(_loopMark);
        break;
      }
      if (this.position === _loopStart) break;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('bitwiseORExpression', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('bitwiseORExpression', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsebitwiseXORExpression() {
    const __memoStart = this.position;
    const __memoKey = 'bitwiseXORExpression@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('bitwiseXORExpression', this.position);
    }
    let __ok = false;
    try {
    this.parsebitwiseANDExpression();
    // Group *
    while (true) {
      const _loopStart = this.position;
      const _loopMark = this.markEventState();
      try {
    this.consume('TOKEN__5E_');
    this.parsebitwiseANDExpression();
      } catch (e) {
        this.position = _loopStart;
        this.restoreEventState(_loopMark);
        break;
      }
      if (this.position === _loopStart) break;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('bitwiseXORExpression', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('bitwiseXORExpression', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsebitwiseANDExpression() {
    const __memoStart = this.position;
    const __memoKey = 'bitwiseANDExpression@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('bitwiseANDExpression', this.position);
    }
    let __ok = false;
    try {
    this.parseequalityExpression();
    // Group *
    while (true) {
      const _loopStart = this.position;
      const _loopMark = this.markEventState();
      try {
    this.consume('TOKEN__26_');
    this.parseequalityExpression();
      } catch (e) {
        this.position = _loopStart;
        this.restoreEventState(_loopMark);
        break;
      }
      if (this.position === _loopStart) break;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('bitwiseANDExpression', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('bitwiseANDExpression', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parseequalityExpression() {
    const __memoStart = this.position;
    const __memoKey = 'equalityExpression@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('equalityExpression', this.position);
    }
    let __ok = false;
    try {
    this.parserelationalExpression();
    // Group *
    while (true) {
      const _loopStart = this.position;
      const _loopMark = this.markEventState();
      try {
    // Group
    {
      let _matchedAlt = false;
      if (!_matchedAlt) {
        const _altStart = this.position;
        const _altMark = this.markEventState();
        try {
    this.consume('TOKEN__3D__3D_');
          _matchedAlt = true;
        } catch (e) {
          this.position = _altStart;
          this.restoreEventState(_altMark);
        }
      }
      if (!_matchedAlt) {
        const _altStart = this.position;
        const _altMark = this.markEventState();
        try {
    this.consume('TOKEN__21__3D_');
          _matchedAlt = true;
        } catch (e) {
          this.position = _altStart;
          this.restoreEventState(_altMark);
        }
      }
      if (!_matchedAlt) {
        const _altStart = this.position;
        const _altMark = this.markEventState();
        try {
    this.consume('TOKEN__3D__3D__3D_');
          _matchedAlt = true;
        } catch (e) {
          this.position = _altStart;
          this.restoreEventState(_altMark);
        }
      }
      if (!_matchedAlt) {
        const _altStart = this.position;
        const _altMark = this.markEventState();
        try {
    this.consume('TOKEN__21__3D__3D_');
          _matchedAlt = true;
        } catch (e) {
          this.position = _altStart;
          this.restoreEventState(_altMark);
        }
      }
      if (!_matchedAlt) { throw __BACKTRACK_ERROR; }
    }
    this.parserelationalExpression();
      } catch (e) {
        this.position = _loopStart;
        this.restoreEventState(_loopMark);
        break;
      }
      if (this.position === _loopStart) break;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('equalityExpression', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('equalityExpression', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parserelationalExpression() {
    const __memoStart = this.position;
    const __memoKey = 'relationalExpression@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('relationalExpression', this.position);
    }
    let __ok = false;
    try {
    this.parseshiftExpression();
    // Group *
    while (true) {
      const _loopStart = this.position;
      const _loopMark = this.markEventState();
      try {
    // Group
    {
      let _matchedAlt = false;
      if (!_matchedAlt) {
        const _altStart = this.position;
        const _altMark = this.markEventState();
        try {
    this.consume('TOKEN__3C_');
          _matchedAlt = true;
        } catch (e) {
          this.position = _altStart;
          this.restoreEventState(_altMark);
        }
      }
      if (!_matchedAlt) {
        const _altStart = this.position;
        const _altMark = this.markEventState();
        try {
    this.consume('TOKEN__3E_');
          _matchedAlt = true;
        } catch (e) {
          this.position = _altStart;
          this.restoreEventState(_altMark);
        }
      }
      if (!_matchedAlt) {
        const _altStart = this.position;
        const _altMark = this.markEventState();
        try {
    this.consume('TOKEN__3C__3D_');
          _matchedAlt = true;
        } catch (e) {
          this.position = _altStart;
          this.restoreEventState(_altMark);
        }
      }
      if (!_matchedAlt) {
        const _altStart = this.position;
        const _altMark = this.markEventState();
        try {
    this.consume('TOKEN__3E__3D_');
          _matchedAlt = true;
        } catch (e) {
          this.position = _altStart;
          this.restoreEventState(_altMark);
        }
      }
      if (!_matchedAlt) {
        const _altStart = this.position;
        const _altMark = this.markEventState();
        try {
    this.consume('TOKEN_instanceof');
          _matchedAlt = true;
        } catch (e) {
          this.position = _altStart;
          this.restoreEventState(_altMark);
        }
      }
      if (!_matchedAlt) {
        const _altStart = this.position;
        const _altMark = this.markEventState();
        try {
    this.consume('TOKEN_in');
          _matchedAlt = true;
        } catch (e) {
          this.position = _altStart;
          this.restoreEventState(_altMark);
        }
      }
      if (!_matchedAlt) { throw __BACKTRACK_ERROR; }
    }
    this.parseshiftExpression();
      } catch (e) {
        this.position = _loopStart;
        this.restoreEventState(_loopMark);
        break;
      }
      if (this.position === _loopStart) break;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('relationalExpression', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('relationalExpression', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parseshiftExpression() {
    const __memoStart = this.position;
    const __memoKey = 'shiftExpression@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('shiftExpression', this.position);
    }
    let __ok = false;
    try {
    this.parseadditiveExpression();
    // Group *
    while (true) {
      const _loopStart = this.position;
      const _loopMark = this.markEventState();
      try {
    // Group
    {
      let _matchedAlt = false;
      if (!_matchedAlt) {
        const _altStart = this.position;
        const _altMark = this.markEventState();
        try {
    this.consume('TOKEN__3C__3C_');
          _matchedAlt = true;
        } catch (e) {
          this.position = _altStart;
          this.restoreEventState(_altMark);
        }
      }
      if (!_matchedAlt) {
        const _altStart = this.position;
        const _altMark = this.markEventState();
        try {
    this.consume('TOKEN__3E__3E_');
          _matchedAlt = true;
        } catch (e) {
          this.position = _altStart;
          this.restoreEventState(_altMark);
        }
      }
      if (!_matchedAlt) {
        const _altStart = this.position;
        const _altMark = this.markEventState();
        try {
    this.consume('TOKEN__3E__3E__3E_');
          _matchedAlt = true;
        } catch (e) {
          this.position = _altStart;
          this.restoreEventState(_altMark);
        }
      }
      if (!_matchedAlt) { throw __BACKTRACK_ERROR; }
    }
    this.parseadditiveExpression();
      } catch (e) {
        this.position = _loopStart;
        this.restoreEventState(_loopMark);
        break;
      }
      if (this.position === _loopStart) break;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('shiftExpression', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('shiftExpression', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parseadditiveExpression() {
    const __memoStart = this.position;
    const __memoKey = 'additiveExpression@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('additiveExpression', this.position);
    }
    let __ok = false;
    try {
    this.parsemultiplicativeExpression();
    // Group *
    while (true) {
      const _loopStart = this.position;
      const _loopMark = this.markEventState();
      try {
    // Group
    {
      let _matchedAlt = false;
      if (!_matchedAlt) {
        const _altStart = this.position;
        const _altMark = this.markEventState();
        try {
    this.consume('TOKEN__2B_');
          _matchedAlt = true;
        } catch (e) {
          this.position = _altStart;
          this.restoreEventState(_altMark);
        }
      }
      if (!_matchedAlt) {
        const _altStart = this.position;
        const _altMark = this.markEventState();
        try {
    this.consume('TOKEN__2D_');
          _matchedAlt = true;
        } catch (e) {
          this.position = _altStart;
          this.restoreEventState(_altMark);
        }
      }
      if (!_matchedAlt) { throw __BACKTRACK_ERROR; }
    }
    this.parsemultiplicativeExpression();
      } catch (e) {
        this.position = _loopStart;
        this.restoreEventState(_loopMark);
        break;
      }
      if (this.position === _loopStart) break;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('additiveExpression', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('additiveExpression', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsemultiplicativeExpression() {
    const __memoStart = this.position;
    const __memoKey = 'multiplicativeExpression@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('multiplicativeExpression', this.position);
    }
    let __ok = false;
    try {
    this.parseexponentiationExpression();
    // Group *
    while (true) {
      const _loopStart = this.position;
      const _loopMark = this.markEventState();
      try {
    // Group
    {
      let _matchedAlt = false;
      if (!_matchedAlt) {
        const _altStart = this.position;
        const _altMark = this.markEventState();
        try {
    this.consume('TOKEN__2A_');
          _matchedAlt = true;
        } catch (e) {
          this.position = _altStart;
          this.restoreEventState(_altMark);
        }
      }
      if (!_matchedAlt) {
        const _altStart = this.position;
        const _altMark = this.markEventState();
        try {
    this.consume('TOKEN__2F_');
          _matchedAlt = true;
        } catch (e) {
          this.position = _altStart;
          this.restoreEventState(_altMark);
        }
      }
      if (!_matchedAlt) {
        const _altStart = this.position;
        const _altMark = this.markEventState();
        try {
    this.consume('TOKEN__25_');
          _matchedAlt = true;
        } catch (e) {
          this.position = _altStart;
          this.restoreEventState(_altMark);
        }
      }
      if (!_matchedAlt) { throw __BACKTRACK_ERROR; }
    }
    this.parseexponentiationExpression();
      } catch (e) {
        this.position = _loopStart;
        this.restoreEventState(_loopMark);
        break;
      }
      if (this.position === _loopStart) break;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('multiplicativeExpression', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('multiplicativeExpression', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parseexponentiationExpression() {
    const __memoStart = this.position;
    const __memoKey = 'exponentiationExpression@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('exponentiationExpression', this.position);
    }
    let __ok = false;
    try {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parsepostfixExpression();
    this.consume('TOKEN__2A__2A_');
    this.parseexponentiationExpression();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parseunaryExpression();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      throw __BACKTRACK_ERROR;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('exponentiationExpression', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('exponentiationExpression', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parseunaryExpression() {
    const __memoStart = this.position;
    const __memoKey = 'unaryExpression@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('unaryExpression', this.position);
    }
    let __ok = false;
    try {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parsepostfixExpression();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN_delete');
    this.parseunaryExpression();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN_void');
    this.parseunaryExpression();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN_typeof');
    this.parseunaryExpression();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN__2B__2B_');
    this.parseunaryExpression();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN__2D__2D_');
    this.parseunaryExpression();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN__2B_');
    this.parseunaryExpression();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN__2D_');
    this.parseunaryExpression();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN__7E_');
    this.parseunaryExpression();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN__21_');
    this.parseunaryExpression();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parseawaitExpression();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      throw __BACKTRACK_ERROR;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('unaryExpression', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('unaryExpression', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parseawaitExpression() {
    const __memoStart = this.position;
    const __memoKey = 'awaitExpression@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('awaitExpression', this.position);
    }
    let __ok = false;
    try {
    this.consume('TOKEN_await');
    this.parseunaryExpression();

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('awaitExpression', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('awaitExpression', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsepostfixExpression() {
    const __memoStart = this.position;
    const __memoKey = 'postfixExpression@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('postfixExpression', this.position);
    }
    let __ok = false;
    try {
    this.parseleftHandSideExpression();
    // Group ?
    {
      const _optStart = this.position;
      const _optMark = this.markEventState();
      try {
      let _matchedAlt = false;
      if (!_matchedAlt) {
        const _altStart = this.position;
        const _altMark = this.markEventState();
        try {
    this.consume('TOKEN__2B__2B_');
          _matchedAlt = true;
        } catch (e) {
          this.position = _altStart;
          this.restoreEventState(_altMark);
        }
      }
      if (!_matchedAlt) {
        const _altStart = this.position;
        const _altMark = this.markEventState();
        try {
    this.consume('TOKEN__2D__2D_');
          _matchedAlt = true;
        } catch (e) {
          this.position = _altStart;
          this.restoreEventState(_altMark);
        }
      }
      if (!_matchedAlt) { throw __BACKTRACK_ERROR; }
      } catch (e) {
        this.position = _optStart;
        this.restoreEventState(_optMark);
      }
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('postfixExpression', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('postfixExpression', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parseleftHandSideExpression() {
    const __memoStart = this.position;
    const __memoKey = 'leftHandSideExpression@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('leftHandSideExpression', this.position);
    }
    let __ok = false;
    try {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parsecallExpression();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parsenewExpression();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      throw __BACKTRACK_ERROR;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('leftHandSideExpression', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('leftHandSideExpression', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsenewExpression() {
    const __memoStart = this.position;
    const __memoKey = 'newExpression@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('newExpression', this.position);
    }
    let __ok = false;
    try {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parsememberExpression();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN_new');
    this.parsenewExpression();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      throw __BACKTRACK_ERROR;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('newExpression', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('newExpression', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsememberExpression() {
    const __memoStart = this.position;
    const __memoKey = 'memberExpression@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('memberExpression', this.position);
    }
    let __ok = false;
    try {
    // Group
    {
      let _matchedAlt = false;
      if (!_matchedAlt) {
        const _altStart = this.position;
        const _altMark = this.markEventState();
        try {
    this.parseprimaryExpression();
          _matchedAlt = true;
        } catch (e) {
          this.position = _altStart;
          this.restoreEventState(_altMark);
        }
      }
      if (!_matchedAlt) {
        const _altStart = this.position;
        const _altMark = this.markEventState();
        try {
    this.parsefunctionExpression();
          _matchedAlt = true;
        } catch (e) {
          this.position = _altStart;
          this.restoreEventState(_altMark);
        }
      }
      if (!_matchedAlt) {
        const _altStart = this.position;
        const _altMark = this.markEventState();
        try {
    this.parsegeneratorExpression();
          _matchedAlt = true;
        } catch (e) {
          this.position = _altStart;
          this.restoreEventState(_altMark);
        }
      }
      if (!_matchedAlt) {
        const _altStart = this.position;
        const _altMark = this.markEventState();
        try {
    this.parseasyncFunctionExpression();
          _matchedAlt = true;
        } catch (e) {
          this.position = _altStart;
          this.restoreEventState(_altMark);
        }
      }
      if (!_matchedAlt) {
        const _altStart = this.position;
        const _altMark = this.markEventState();
        try {
    this.parseclassExpression();
          _matchedAlt = true;
        } catch (e) {
          this.position = _altStart;
          this.restoreEventState(_altMark);
        }
      }
      if (!_matchedAlt) {
        const _altStart = this.position;
        const _altMark = this.markEventState();
        try {
    this.parsesuperProperty();
          _matchedAlt = true;
        } catch (e) {
          this.position = _altStart;
          this.restoreEventState(_altMark);
        }
      }
      if (!_matchedAlt) {
        const _altStart = this.position;
        const _altMark = this.markEventState();
        try {
    this.parsemetaProperty();
          _matchedAlt = true;
        } catch (e) {
          this.position = _altStart;
          this.restoreEventState(_altMark);
        }
      }
      if (!_matchedAlt) {
        const _altStart = this.position;
        const _altMark = this.markEventState();
        try {
    this.consume('TOKEN_new');
    this.parsememberExpression();
    this.parsearguments();
          _matchedAlt = true;
        } catch (e) {
          this.position = _altStart;
          this.restoreEventState(_altMark);
        }
      }
      if (!_matchedAlt) { throw __BACKTRACK_ERROR; }
    }
    // Group *
    while (true) {
      const _loopStart = this.position;
      const _loopMark = this.markEventState();
      try {
      let _matchedAlt = false;
      if (!_matchedAlt) {
        const _altStart = this.position;
        const _altMark = this.markEventState();
        try {
    this.consume('TOKEN__5B_');
    this.parseexpression();
    this.consume('TOKEN__5D_');
          _matchedAlt = true;
        } catch (e) {
          this.position = _altStart;
          this.restoreEventState(_altMark);
        }
      }
      if (!_matchedAlt) {
        const _altStart = this.position;
        const _altMark = this.markEventState();
        try {
    this.consume('TOKEN__2E_');
    this.parsepropertyIdentifierName();
          _matchedAlt = true;
        } catch (e) {
          this.position = _altStart;
          this.restoreEventState(_altMark);
        }
      }
      if (!_matchedAlt) {
        const _altStart = this.position;
        const _altMark = this.markEventState();
        try {
    this.parsetemplateLiteral();
          _matchedAlt = true;
        } catch (e) {
          this.position = _altStart;
          this.restoreEventState(_altMark);
        }
      }
      if (!_matchedAlt) { throw __BACKTRACK_ERROR; }
      } catch (e) {
        this.position = _loopStart;
        this.restoreEventState(_loopMark);
        break;
      }
      if (this.position === _loopStart) break;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('memberExpression', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('memberExpression', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parseprimaryExpression() {
    const __memoStart = this.position;
    const __memoKey = 'primaryExpression@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('primaryExpression', this.position);
    }
    let __ok = false;
    try {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN_this');
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parseidentifierReference();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parseliteral();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parsearrayLiteral();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parseobjectLiteral();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parsetemplateLiteral();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN__28_');
    this.parseexpression();
    this.consume('TOKEN__29_');
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      throw __BACKTRACK_ERROR;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('primaryExpression', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('primaryExpression', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parseliteral() {
    const __memoStart = this.position;
    const __memoKey = 'literal@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('literal', this.position);
    }
    let __ok = false;
    try {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parsenullLiteral();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parsebooleanLiteral();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parsenumericLiteral();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parsestringLiteral();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parseregularExpressionLiteral();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      throw __BACKTRACK_ERROR;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('literal', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('literal', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsenumericLiteral() {
    const __memoStart = this.position;
    const __memoKey = 'numericLiteral@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('numericLiteral', this.position);
    }
    let __ok = false;
    try {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('DecimalLiteral');
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('BinaryIntegerLiteral');
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('HexIntegerLiteral');
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('OctalIntegerLiteral');
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      throw __BACKTRACK_ERROR;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('numericLiteral', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('numericLiteral', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsestringLiteral() {
    const __memoStart = this.position;
    const __memoKey = 'stringLiteral@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('stringLiteral', this.position);
    }
    let __ok = false;
    try {
    this.consume('StringLiteral');

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('stringLiteral', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('stringLiteral', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parseregularExpressionLiteral() {
    const __memoStart = this.position;
    const __memoKey = 'regularExpressionLiteral@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('regularExpressionLiteral', this.position);
    }
    let __ok = false;
    try {
    this.consume('RegularExpressionLiteral');

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('regularExpressionLiteral', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('regularExpressionLiteral', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsearrayLiteral() {
    const __memoStart = this.position;
    const __memoKey = 'arrayLiteral@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('arrayLiteral', this.position);
    }
    let __ok = false;
    try {
    this.consume('TOKEN__5B_');
    // Optional: try parsing arrayElement
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      try {
        this.parsearrayElement();
      } catch(e) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
    // Group *
    while (true) {
      const _loopStart = this.position;
      const _loopMark = this.markEventState();
      try {
    this.consume('TOKEN__2C_');
    // Optional: try parsing arrayElement
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      try {
        this.parsearrayElement();
      } catch(e) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
      } catch (e) {
        this.position = _loopStart;
        this.restoreEventState(_loopMark);
        break;
      }
      if (this.position === _loopStart) break;
    }
    this.consume('TOKEN__5D_');

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('arrayLiteral', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('arrayLiteral', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsearrayElement() {
    const __memoStart = this.position;
    const __memoKey = 'arrayElement@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('arrayElement', this.position);
    }
    let __ok = false;
    try {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parseassignmentExpression();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parsespreadElement();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      throw __BACKTRACK_ERROR;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('arrayElement', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('arrayElement', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parseelementList() {
    const __memoStart = this.position;
    const __memoKey = 'elementList@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('elementList', this.position);
    }
    let __ok = false;
    try {
    this.parsearrayElement();
    // Group *
    while (true) {
      const _loopStart = this.position;
      const _loopMark = this.markEventState();
      try {
    this.consume('TOKEN__2C_');
    this.parsearrayElement();
      } catch (e) {
        this.position = _loopStart;
        this.restoreEventState(_loopMark);
        break;
      }
      if (this.position === _loopStart) break;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('elementList', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('elementList', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parseelision() {
    const __memoStart = this.position;
    const __memoKey = 'elision@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('elision', this.position);
    }
    let __ok = false;
    try {
    this.consume('TOKEN__2C_');
    while (this.match('TOKEN__2C_')) { /* additional terminal matched */ }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('elision', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('elision', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsespreadElement() {
    const __memoStart = this.position;
    const __memoKey = 'spreadElement@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('spreadElement', this.position);
    }
    let __ok = false;
    try {
    this.consume('TOKEN__2E__2E__2E_');
    this.parseassignmentExpression();

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('spreadElement', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('spreadElement', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parseobjectLiteral() {
    const __memoStart = this.position;
    const __memoKey = 'objectLiteral@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('objectLiteral', this.position);
    }
    let __ok = false;
    try {
    this.consume('TOKEN__7B_');
    // Group ?
    {
      const _optStart = this.position;
      const _optMark = this.markEventState();
      try {
    this.parsepropertyAssignment();
    // Group *
    while (true) {
      const _loopStart = this.position;
      const _loopMark = this.markEventState();
      try {
    this.consume('TOKEN__2C_');
    this.parsepropertyAssignment();
      } catch (e) {
        this.position = _loopStart;
        this.restoreEventState(_loopMark);
        break;
      }
      if (this.position === _loopStart) break;
    }
    if (this.match('TOKEN__2C_')) { /* optional matched */ }
      } catch (e) {
        this.position = _optStart;
        this.restoreEventState(_optMark);
      }
    }
    this.consume('TOKEN__7D_');

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('objectLiteral', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('objectLiteral', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsepropertyAssignment() {
    const __memoStart = this.position;
    const __memoKey = 'propertyAssignment@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('propertyAssignment', this.position);
    }
    let __ok = false;
    try {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parsepropertyName();
    this.consume('TOKEN__3A_');
    this.parseassignmentExpression();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parsespreadProperty();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parseidentifierReference();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parsecoverInitializedName();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parsemethodDefinition();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN_get');
    this.parsepropertyName();
    this.consume('TOKEN__28_');
    this.consume('TOKEN__29_');
    this.consume('TOKEN__7B_');
    this.parsefunctionBody();
    this.consume('TOKEN__7D_');
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN_set');
    this.parsepropertyName();
    this.consume('TOKEN__28_');
    this.parsepropertySetParameterList();
    this.consume('TOKEN__29_');
    this.consume('TOKEN__7B_');
    this.parsefunctionBody();
    this.consume('TOKEN__7D_');
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      throw __BACKTRACK_ERROR;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('propertyAssignment', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('propertyAssignment', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsespreadProperty() {
    const __memoStart = this.position;
    const __memoKey = 'spreadProperty@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('spreadProperty', this.position);
    }
    let __ok = false;
    try {
    this.consume('TOKEN__2E__2E__2E_');
    this.parseassignmentExpression();

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('spreadProperty', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('spreadProperty', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsepropertyName() {
    const __memoStart = this.position;
    const __memoKey = 'propertyName@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('propertyName', this.position);
    }
    let __ok = false;
    try {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parseliteralPropertyName();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parsecomputedPropertyName();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      throw __BACKTRACK_ERROR;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('propertyName', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('propertyName', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parseliteralPropertyName() {
    const __memoStart = this.position;
    const __memoKey = 'literalPropertyName@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('literalPropertyName', this.position);
    }
    let __ok = false;
    try {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parsepropertyIdentifierName();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parsestringLiteral();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parsenumericLiteral();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      throw __BACKTRACK_ERROR;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('literalPropertyName', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('literalPropertyName', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsecomputedPropertyName() {
    const __memoStart = this.position;
    const __memoKey = 'computedPropertyName@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('computedPropertyName', this.position);
    }
    let __ok = false;
    try {
    this.consume('TOKEN__5B_');
    this.parseassignmentExpression();
    this.consume('TOKEN__5D_');

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('computedPropertyName', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('computedPropertyName', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parseidentifierReference() {
    const __memoStart = this.position;
    const __memoKey = 'identifierReference@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('identifierReference', this.position);
    }
    let __ok = false;
    try {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parseidentifier();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parsecontextualIdentifier();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      throw __BACKTRACK_ERROR;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('identifierReference', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('identifierReference', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsecoverInitializedName() {
    const __memoStart = this.position;
    const __memoKey = 'coverInitializedName@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('coverInitializedName', this.position);
    }
    let __ok = false;
    try {
    this.parseidentifierReference();
    this.parseinitializer();

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('coverInitializedName', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('coverInitializedName', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsebindingIdentifier() {
    const __memoStart = this.position;
    const __memoKey = 'bindingIdentifier@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('bindingIdentifier', this.position);
    }
    let __ok = false;
    try {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parseidentifier();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parsecontextualIdentifier();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      throw __BACKTRACK_ERROR;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('bindingIdentifier', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('bindingIdentifier', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsecontextualIdentifier() {
    const __memoStart = this.position;
    const __memoKey = 'contextualIdentifier@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('contextualIdentifier', this.position);
    }
    let __ok = false;
    try {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN_as');
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN_async');
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN_from');
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN_get');
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN_of');
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN_set');
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN_static');
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN_target');
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      throw __BACKTRACK_ERROR;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('contextualIdentifier', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('contextualIdentifier', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsebindingPattern() {
    const __memoStart = this.position;
    const __memoKey = 'bindingPattern@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('bindingPattern', this.position);
    }
    let __ok = false;
    try {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parseobjectBindingPattern();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parsearrayBindingPattern();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      throw __BACKTRACK_ERROR;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('bindingPattern', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('bindingPattern', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parseobjectBindingPattern() {
    const __memoStart = this.position;
    const __memoKey = 'objectBindingPattern@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('objectBindingPattern', this.position);
    }
    let __ok = false;
    try {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN__7B_');
    this.consume('TOKEN__7D_');
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN__7B_');
    this.parsebindingPropertyList();
    this.consume('TOKEN__7D_');
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN__7B_');
    this.parsebindingPropertyList();
    this.consume('TOKEN__2C_');
    this.consume('TOKEN__7D_');
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      throw __BACKTRACK_ERROR;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('objectBindingPattern', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('objectBindingPattern', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsearrayBindingPattern() {
    const __memoStart = this.position;
    const __memoKey = 'arrayBindingPattern@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('arrayBindingPattern', this.position);
    }
    let __ok = false;
    try {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN__5B_');
    // Optional: try parsing elision
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      try {
        this.parseelision();
      } catch(e) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
    // Optional: try parsing bindingRestElement
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      try {
        this.parsebindingRestElement();
      } catch(e) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
    this.consume('TOKEN__5D_');
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN__5B_');
    this.parsebindingElementList();
    this.consume('TOKEN__5D_');
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN__5B_');
    this.parsebindingElementList();
    this.consume('TOKEN__2C_');
    // Optional: try parsing elision
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      try {
        this.parseelision();
      } catch(e) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
    // Optional: try parsing bindingRestElement
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      try {
        this.parsebindingRestElement();
      } catch(e) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
    this.consume('TOKEN__5D_');
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      throw __BACKTRACK_ERROR;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('arrayBindingPattern', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('arrayBindingPattern', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsebindingPropertyList() {
    const __memoStart = this.position;
    const __memoKey = 'bindingPropertyList@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('bindingPropertyList', this.position);
    }
    let __ok = false;
    try {
    this.parsebindingProperty();
    // Group *
    while (true) {
      const _loopStart = this.position;
      const _loopMark = this.markEventState();
      try {
    this.consume('TOKEN__2C_');
    this.parsebindingProperty();
      } catch (e) {
        this.position = _loopStart;
        this.restoreEventState(_loopMark);
        break;
      }
      if (this.position === _loopStart) break;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('bindingPropertyList', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('bindingPropertyList', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsebindingElementList() {
    const __memoStart = this.position;
    const __memoKey = 'bindingElementList@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('bindingElementList', this.position);
    }
    let __ok = false;
    try {
    this.parsebindingElisionElement();
    // Group *
    while (true) {
      const _loopStart = this.position;
      const _loopMark = this.markEventState();
      try {
    this.consume('TOKEN__2C_');
    this.parsebindingElisionElement();
      } catch (e) {
        this.position = _loopStart;
        this.restoreEventState(_loopMark);
        break;
      }
      if (this.position === _loopStart) break;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('bindingElementList', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('bindingElementList', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsebindingElisionElement() {
    const __memoStart = this.position;
    const __memoKey = 'bindingElisionElement@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('bindingElisionElement', this.position);
    }
    let __ok = false;
    try {
    // Optional: try parsing elision
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      try {
        this.parseelision();
      } catch(e) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
    this.parsebindingElement();

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('bindingElisionElement', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('bindingElisionElement', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsebindingProperty() {
    const __memoStart = this.position;
    const __memoKey = 'bindingProperty@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('bindingProperty', this.position);
    }
    let __ok = false;
    try {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parsesingleNameBinding();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parsepropertyName();
    this.consume('TOKEN__3A_');
    this.parsebindingElement();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      throw __BACKTRACK_ERROR;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('bindingProperty', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('bindingProperty', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsebindingElement() {
    const __memoStart = this.position;
    const __memoKey = 'bindingElement@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('bindingElement', this.position);
    }
    let __ok = false;
    try {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parsesingleNameBinding();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parsebindingPattern();
    // Optional: try parsing initializer
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      try {
        this.parseinitializer();
      } catch(e) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      throw __BACKTRACK_ERROR;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('bindingElement', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('bindingElement', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsesingleNameBinding() {
    const __memoStart = this.position;
    const __memoKey = 'singleNameBinding@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('singleNameBinding', this.position);
    }
    let __ok = false;
    try {
    this.parsebindingIdentifier();
    // Optional: try parsing initializer
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      try {
        this.parseinitializer();
      } catch(e) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('singleNameBinding', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('singleNameBinding', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsebindingRestElement() {
    const __memoStart = this.position;
    const __memoKey = 'bindingRestElement@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('bindingRestElement', this.position);
    }
    let __ok = false;
    try {
    this.consume('TOKEN__2E__2E__2E_');
    this.parsebindingIdentifier();

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('bindingRestElement', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('bindingRestElement', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsefunctionBody() {
    const __memoStart = this.position;
    const __memoKey = 'functionBody@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('functionBody', this.position);
    }
    let __ok = false;
    try {
    while (true) {
      const savePos = this.position;
      const saveMark = this.markEventState();
      try {
        this.parsesourceElement();
        if (this.position === savePos) break;
      } catch(e) {
        this.position = savePos;
        this.restoreEventState(saveMark);
        break;
      }
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('functionBody', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('functionBody', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsepropertySetParameterList() {
    const __memoStart = this.position;
    const __memoKey = 'propertySetParameterList@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('propertySetParameterList', this.position);
    }
    let __ok = false;
    try {
    this.parseformalParameter();

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('propertySetParameterList', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('propertySetParameterList', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parseexpression() {
    const __memoStart = this.position;
    const __memoKey = 'expression@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('expression', this.position);
    }
    let __ok = false;
    try {
    this.parseassignmentExpression();
    // Group *
    while (true) {
      const _loopStart = this.position;
      const _loopMark = this.markEventState();
      try {
    this.consume('TOKEN__2C_');
    this.parseassignmentExpression();
      } catch (e) {
        this.position = _loopStart;
        this.restoreEventState(_loopMark);
        break;
      }
      if (this.position === _loopStart) break;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('expression', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('expression', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsefunctionExpression() {
    const __memoStart = this.position;
    const __memoKey = 'functionExpression@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('functionExpression', this.position);
    }
    let __ok = false;
    try {
    this.consume('TOKEN_function');
    // Optional: try parsing identifier
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      try {
        this.parseidentifier();
      } catch(e) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
    this.consume('TOKEN__28_');
    // Optional: try parsing formalParameterList
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      try {
        this.parseformalParameterList();
      } catch(e) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
    this.consume('TOKEN__29_');
    this.consume('TOKEN__7B_');
    this.parsefunctionBody();
    this.consume('TOKEN__7D_');

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('functionExpression', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('functionExpression', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parseasyncFunctionExpression() {
    const __memoStart = this.position;
    const __memoKey = 'asyncFunctionExpression@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('asyncFunctionExpression', this.position);
    }
    let __ok = false;
    try {
    this.consume('TOKEN_async');
    this.consume('TOKEN_function');
    // Optional: try parsing identifier
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      try {
        this.parseidentifier();
      } catch(e) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
    this.consume('TOKEN__28_');
    // Optional: try parsing formalParameterList
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      try {
        this.parseformalParameterList();
      } catch(e) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
    this.consume('TOKEN__29_');
    this.consume('TOKEN__7B_');
    this.parseasyncFunctionBody();
    this.consume('TOKEN__7D_');

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('asyncFunctionExpression', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('asyncFunctionExpression', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parseclassExpression() {
    const __memoStart = this.position;
    const __memoKey = 'classExpression@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('classExpression', this.position);
    }
    let __ok = false;
    try {
    this.consume('TOKEN_class');
    // Optional: try parsing identifier
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      try {
        this.parseidentifier();
      } catch(e) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
    this.parseclassTail();

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('classExpression', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('classExpression', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parseformalParameterList() {
    const __memoStart = this.position;
    const __memoKey = 'formalParameterList@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('formalParameterList', this.position);
    }
    let __ok = false;
    try {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parseformalsList();
    this.consume('TOKEN__2C_');
    this.parsefunctionRestParameter();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parseformalsList();
    this.consume('TOKEN__2C_');
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parsefunctionRestParameter();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parseformalsList();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      throw __BACKTRACK_ERROR;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('formalParameterList', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('formalParameterList', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parseformalsList() {
    const __memoStart = this.position;
    const __memoKey = 'formalsList@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('formalsList', this.position);
    }
    let __ok = false;
    try {
    this.parseformalParameter();
    // Group *
    while (true) {
      const _loopStart = this.position;
      const _loopMark = this.markEventState();
      try {
    this.consume('TOKEN__2C_');
    this.parseformalParameter();
      } catch (e) {
        this.position = _loopStart;
        this.restoreEventState(_loopMark);
        break;
      }
      if (this.position === _loopStart) break;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('formalsList', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('formalsList', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parseformalParameter() {
    const __memoStart = this.position;
    const __memoKey = 'formalParameter@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('formalParameter', this.position);
    }
    let __ok = false;
    try {
    this.parsebindingElement();

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('formalParameter', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('formalParameter', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsefunctionRestParameter() {
    const __memoStart = this.position;
    const __memoKey = 'functionRestParameter@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('functionRestParameter', this.position);
    }
    let __ok = false;
    try {
    this.parsebindingRestElement();

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('functionRestParameter', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('functionRestParameter', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsearguments() {
    const __memoStart = this.position;
    const __memoKey = 'arguments@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('arguments', this.position);
    }
    let __ok = false;
    try {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN__28_');
    this.consume('TOKEN__29_');
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN__28_');
    this.parseargumentList();
    this.consume('TOKEN__29_');
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN__28_');
    this.parseargumentList();
    this.consume('TOKEN__2C_');
    this.consume('TOKEN__29_');
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      throw __BACKTRACK_ERROR;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('arguments', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('arguments', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parseargumentList() {
    const __memoStart = this.position;
    const __memoKey = 'argumentList@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('argumentList', this.position);
    }
    let __ok = false;
    try {
    this.parseargumentItem();
    // Group *
    while (true) {
      const _loopStart = this.position;
      const _loopMark = this.markEventState();
      try {
    this.consume('TOKEN__2C_');
    this.parseargumentItem();
      } catch (e) {
        this.position = _loopStart;
        this.restoreEventState(_loopMark);
        break;
      }
      if (this.position === _loopStart) break;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('argumentList', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('argumentList', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parseargumentItem() {
    const __memoStart = this.position;
    const __memoKey = 'argumentItem@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('argumentItem', this.position);
    }
    let __ok = false;
    try {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parseassignmentExpression();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN__2E__2E__2E_');
    this.parseassignmentExpression();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      throw __BACKTRACK_ERROR;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('argumentItem', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('argumentItem', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsecallExpression() {
    const __memoStart = this.position;
    const __memoKey = 'callExpression@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('callExpression', this.position);
    }
    let __ok = false;
    try {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parsememberExpression();
    this.parsearguments();
    // Group *
    while (true) {
      const _loopStart = this.position;
      const _loopMark = this.markEventState();
      try {
      let _matchedAlt = false;
      if (!_matchedAlt) {
        const _altStart = this.position;
        const _altMark = this.markEventState();
        try {
    this.parsearguments();
          _matchedAlt = true;
        } catch (e) {
          this.position = _altStart;
          this.restoreEventState(_altMark);
        }
      }
      if (!_matchedAlt) {
        const _altStart = this.position;
        const _altMark = this.markEventState();
        try {
    this.consume('TOKEN__5B_');
    this.parseexpression();
    this.consume('TOKEN__5D_');
          _matchedAlt = true;
        } catch (e) {
          this.position = _altStart;
          this.restoreEventState(_altMark);
        }
      }
      if (!_matchedAlt) {
        const _altStart = this.position;
        const _altMark = this.markEventState();
        try {
    this.consume('TOKEN__2E_');
    this.parsepropertyIdentifierName();
          _matchedAlt = true;
        } catch (e) {
          this.position = _altStart;
          this.restoreEventState(_altMark);
        }
      }
      if (!_matchedAlt) {
        const _altStart = this.position;
        const _altMark = this.markEventState();
        try {
    this.parsetemplateLiteral();
          _matchedAlt = true;
        } catch (e) {
          this.position = _altStart;
          this.restoreEventState(_altMark);
        }
      }
      if (!_matchedAlt) { throw __BACKTRACK_ERROR; }
      } catch (e) {
        this.position = _loopStart;
        this.restoreEventState(_loopMark);
        break;
      }
      if (this.position === _loopStart) break;
    }
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parsesuperCall();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      throw __BACKTRACK_ERROR;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('callExpression', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('callExpression', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parseemptyStatement() {
    const __memoStart = this.position;
    const __memoKey = 'emptyStatement@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('emptyStatement', this.position);
    }
    let __ok = false;
    try {
    this.consume('TOKEN__3B_');

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('emptyStatement', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('emptyStatement', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parseassignmentOperator() {
    const __memoStart = this.position;
    const __memoKey = 'assignmentOperator@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('assignmentOperator', this.position);
    }
    let __ok = false;
    try {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN__3D_');
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN__2A__3D_');
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN__2F__3D_');
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN__25__3D_');
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN__2A__2A__3D_');
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN__2B__3D_');
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN__2D__3D_');
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN__3C__3C__3D_');
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN__3E__3E__3D_');
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN__3E__3E__3E__3D_');
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN__26__3D_');
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN__5E__3D_');
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN__7C__3D_');
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      throw __BACKTRACK_ERROR;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('assignmentOperator', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('assignmentOperator', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parseexpressionStatement() {
    const __memoStart = this.position;
    const __memoKey = 'expressionStatement@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('expressionStatement', this.position);
    }
    let __ok = false;
    try {
    this.parseexpression();
    this.parsesemicolon();

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('expressionStatement', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('expressionStatement', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parseifStatement() {
    const __memoStart = this.position;
    const __memoKey = 'ifStatement@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('ifStatement', this.position);
    }
    let __ok = false;
    try {
    this.consume('TOKEN_if');
    this.consume('TOKEN__28_');
    this.parseexpression();
    this.consume('TOKEN__29_');
    this.parsestatement();
    // Group ?
    {
      const _optStart = this.position;
      const _optMark = this.markEventState();
      try {
    this.consume('TOKEN_else');
    this.parsestatement();
      } catch (e) {
        this.position = _optStart;
        this.restoreEventState(_optMark);
      }
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('ifStatement', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('ifStatement', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parseiterationStatement() {
    const __memoStart = this.position;
    const __memoKey = 'iterationStatement@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('iterationStatement', this.position);
    }
    let __ok = false;
    try {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN_do');
    this.parsestatement();
    this.consume('TOKEN_while');
    this.consume('TOKEN__28_');
    this.parseexpression();
    this.consume('TOKEN__29_');
    this.parsesemicolon();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN_while');
    this.consume('TOKEN__28_');
    this.parseexpression();
    this.consume('TOKEN__29_');
    this.parsestatement();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN_for');
    this.consume('TOKEN__28_');
    // Optional: try parsing expressionNoIn
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      try {
        this.parseexpressionNoIn();
      } catch(e) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
    this.consume('TOKEN__3B_');
    // Optional: try parsing expression
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      try {
        this.parseexpression();
      } catch(e) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
    this.consume('TOKEN__3B_');
    // Optional: try parsing expression
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      try {
        this.parseexpression();
      } catch(e) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
    this.consume('TOKEN__29_');
    this.parsestatement();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN_for');
    this.consume('TOKEN__28_');
    this.consume('TOKEN_var');
    this.parsevariableDeclarationListNoIn();
    this.consume('TOKEN__3B_');
    // Optional: try parsing expression
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      try {
        this.parseexpression();
      } catch(e) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
    this.consume('TOKEN__3B_');
    // Optional: try parsing expression
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      try {
        this.parseexpression();
      } catch(e) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
    this.consume('TOKEN__29_');
    this.parsestatement();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN_for');
    this.consume('TOKEN__28_');
    this.parseleftHandSideExpression();
    this.consume('TOKEN_in');
    this.parseexpression();
    this.consume('TOKEN__29_');
    this.parsestatement();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN_for');
    this.consume('TOKEN__28_');
    this.consume('TOKEN_var');
    this.parsevariableDeclarationNoIn();
    this.consume('TOKEN_in');
    this.parseexpression();
    this.consume('TOKEN__29_');
    this.parsestatement();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN_for');
    this.consume('TOKEN__28_');
    this.parseleftHandSideExpression();
    this.consume('TOKEN_of');
    this.parseexpression();
    this.consume('TOKEN__29_');
    this.parsestatement();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN_for');
    this.consume('TOKEN__28_');
    this.consume('TOKEN_let');
    this.parsevariableDeclarationNoIn();
    this.consume('TOKEN_of');
    this.parseassignmentExpression();
    this.consume('TOKEN__29_');
    this.parsestatement();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN_for');
    this.consume('TOKEN__28_');
    this.consume('TOKEN_const');
    this.parsevariableDeclarationNoIn();
    this.consume('TOKEN_of');
    this.parseassignmentExpression();
    this.consume('TOKEN__29_');
    this.parsestatement();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN_for');
    this.consume('TOKEN__28_');
    this.parselexicalDeclaration();
    // Optional: try parsing expression
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      try {
        this.parseexpression();
      } catch(e) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
    this.consume('TOKEN__3B_');
    // Optional: try parsing expression
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      try {
        this.parseexpression();
      } catch(e) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
    this.consume('TOKEN__29_');
    this.parsestatement();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      throw __BACKTRACK_ERROR;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('iterationStatement', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('iterationStatement', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parseexpressionNoIn() {
    const __memoStart = this.position;
    const __memoKey = 'expressionNoIn@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('expressionNoIn', this.position);
    }
    let __ok = false;
    try {
    this.parseassignmentExpressionNoIn();
    // Group *
    while (true) {
      const _loopStart = this.position;
      const _loopMark = this.markEventState();
      try {
    this.consume('TOKEN__2C_');
    this.parseassignmentExpressionNoIn();
      } catch (e) {
        this.position = _loopStart;
        this.restoreEventState(_loopMark);
        break;
      }
      if (this.position === _loopStart) break;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('expressionNoIn', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('expressionNoIn', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parseassignmentExpressionNoIn() {
    const __memoStart = this.position;
    const __memoKey = 'assignmentExpressionNoIn@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('assignmentExpressionNoIn', this.position);
    }
    let __ok = false;
    try {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parseleftHandSideExpression();
    this.parseassignmentOperator();
    this.parseassignmentExpressionNoIn();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parseconditionalExpressionNoIn();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      throw __BACKTRACK_ERROR;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('assignmentExpressionNoIn', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('assignmentExpressionNoIn', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parseconditionalExpressionNoIn() {
    const __memoStart = this.position;
    const __memoKey = 'conditionalExpressionNoIn@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('conditionalExpressionNoIn', this.position);
    }
    let __ok = false;
    try {
    this.parselogicalORExpressionNoIn();
    // Group *
    while (true) {
      const _loopStart = this.position;
      const _loopMark = this.markEventState();
      try {
    this.consume('TOKEN__3F_');
    this.parseassignmentExpression();
    this.consume('TOKEN__3A_');
    this.parseassignmentExpressionNoIn();
      } catch (e) {
        this.position = _loopStart;
        this.restoreEventState(_loopMark);
        break;
      }
      if (this.position === _loopStart) break;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('conditionalExpressionNoIn', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('conditionalExpressionNoIn', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parselogicalORExpressionNoIn() {
    const __memoStart = this.position;
    const __memoKey = 'logicalORExpressionNoIn@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('logicalORExpressionNoIn', this.position);
    }
    let __ok = false;
    try {
    this.parselogicalANDExpressionNoIn();
    // Group *
    while (true) {
      const _loopStart = this.position;
      const _loopMark = this.markEventState();
      try {
    this.consume('TOKEN__7C__7C_');
    this.parselogicalANDExpressionNoIn();
      } catch (e) {
        this.position = _loopStart;
        this.restoreEventState(_loopMark);
        break;
      }
      if (this.position === _loopStart) break;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('logicalORExpressionNoIn', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('logicalORExpressionNoIn', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parselogicalANDExpressionNoIn() {
    const __memoStart = this.position;
    const __memoKey = 'logicalANDExpressionNoIn@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('logicalANDExpressionNoIn', this.position);
    }
    let __ok = false;
    try {
    this.parsebitwiseORExpressionNoIn();
    // Group *
    while (true) {
      const _loopStart = this.position;
      const _loopMark = this.markEventState();
      try {
    this.consume('TOKEN__26__26_');
    this.parsebitwiseORExpressionNoIn();
      } catch (e) {
        this.position = _loopStart;
        this.restoreEventState(_loopMark);
        break;
      }
      if (this.position === _loopStart) break;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('logicalANDExpressionNoIn', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('logicalANDExpressionNoIn', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsebitwiseORExpressionNoIn() {
    const __memoStart = this.position;
    const __memoKey = 'bitwiseORExpressionNoIn@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('bitwiseORExpressionNoIn', this.position);
    }
    let __ok = false;
    try {
    this.parsebitwiseXORExpressionNoIn();
    // Group *
    while (true) {
      const _loopStart = this.position;
      const _loopMark = this.markEventState();
      try {
    this.consume('TOKEN__7C_');
    this.parsebitwiseXORExpressionNoIn();
      } catch (e) {
        this.position = _loopStart;
        this.restoreEventState(_loopMark);
        break;
      }
      if (this.position === _loopStart) break;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('bitwiseORExpressionNoIn', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('bitwiseORExpressionNoIn', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsebitwiseXORExpressionNoIn() {
    const __memoStart = this.position;
    const __memoKey = 'bitwiseXORExpressionNoIn@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('bitwiseXORExpressionNoIn', this.position);
    }
    let __ok = false;
    try {
    this.parsebitwiseANDExpressionNoIn();
    // Group *
    while (true) {
      const _loopStart = this.position;
      const _loopMark = this.markEventState();
      try {
    this.consume('TOKEN__5E_');
    this.parsebitwiseANDExpressionNoIn();
      } catch (e) {
        this.position = _loopStart;
        this.restoreEventState(_loopMark);
        break;
      }
      if (this.position === _loopStart) break;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('bitwiseXORExpressionNoIn', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('bitwiseXORExpressionNoIn', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsebitwiseANDExpressionNoIn() {
    const __memoStart = this.position;
    const __memoKey = 'bitwiseANDExpressionNoIn@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('bitwiseANDExpressionNoIn', this.position);
    }
    let __ok = false;
    try {
    this.parseequalityExpressionNoIn();
    // Group *
    while (true) {
      const _loopStart = this.position;
      const _loopMark = this.markEventState();
      try {
    this.consume('TOKEN__26_');
    this.parseequalityExpressionNoIn();
      } catch (e) {
        this.position = _loopStart;
        this.restoreEventState(_loopMark);
        break;
      }
      if (this.position === _loopStart) break;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('bitwiseANDExpressionNoIn', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('bitwiseANDExpressionNoIn', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parseequalityExpressionNoIn() {
    const __memoStart = this.position;
    const __memoKey = 'equalityExpressionNoIn@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('equalityExpressionNoIn', this.position);
    }
    let __ok = false;
    try {
    this.parserelationalExpressionNoIn();
    // Group *
    while (true) {
      const _loopStart = this.position;
      const _loopMark = this.markEventState();
      try {
    // Group
    {
      let _matchedAlt = false;
      if (!_matchedAlt) {
        const _altStart = this.position;
        const _altMark = this.markEventState();
        try {
    this.consume('TOKEN__3D__3D_');
          _matchedAlt = true;
        } catch (e) {
          this.position = _altStart;
          this.restoreEventState(_altMark);
        }
      }
      if (!_matchedAlt) {
        const _altStart = this.position;
        const _altMark = this.markEventState();
        try {
    this.consume('TOKEN__21__3D_');
          _matchedAlt = true;
        } catch (e) {
          this.position = _altStart;
          this.restoreEventState(_altMark);
        }
      }
      if (!_matchedAlt) {
        const _altStart = this.position;
        const _altMark = this.markEventState();
        try {
    this.consume('TOKEN__3D__3D__3D_');
          _matchedAlt = true;
        } catch (e) {
          this.position = _altStart;
          this.restoreEventState(_altMark);
        }
      }
      if (!_matchedAlt) {
        const _altStart = this.position;
        const _altMark = this.markEventState();
        try {
    this.consume('TOKEN__21__3D__3D_');
          _matchedAlt = true;
        } catch (e) {
          this.position = _altStart;
          this.restoreEventState(_altMark);
        }
      }
      if (!_matchedAlt) { throw __BACKTRACK_ERROR; }
    }
    this.parserelationalExpressionNoIn();
      } catch (e) {
        this.position = _loopStart;
        this.restoreEventState(_loopMark);
        break;
      }
      if (this.position === _loopStart) break;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('equalityExpressionNoIn', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('equalityExpressionNoIn', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parserelationalExpressionNoIn() {
    const __memoStart = this.position;
    const __memoKey = 'relationalExpressionNoIn@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('relationalExpressionNoIn', this.position);
    }
    let __ok = false;
    try {
    this.parseshiftExpression();
    // Group *
    while (true) {
      const _loopStart = this.position;
      const _loopMark = this.markEventState();
      try {
    // Group
    {
      let _matchedAlt = false;
      if (!_matchedAlt) {
        const _altStart = this.position;
        const _altMark = this.markEventState();
        try {
    this.consume('TOKEN__3C_');
          _matchedAlt = true;
        } catch (e) {
          this.position = _altStart;
          this.restoreEventState(_altMark);
        }
      }
      if (!_matchedAlt) {
        const _altStart = this.position;
        const _altMark = this.markEventState();
        try {
    this.consume('TOKEN__3E_');
          _matchedAlt = true;
        } catch (e) {
          this.position = _altStart;
          this.restoreEventState(_altMark);
        }
      }
      if (!_matchedAlt) {
        const _altStart = this.position;
        const _altMark = this.markEventState();
        try {
    this.consume('TOKEN__3C__3D_');
          _matchedAlt = true;
        } catch (e) {
          this.position = _altStart;
          this.restoreEventState(_altMark);
        }
      }
      if (!_matchedAlt) {
        const _altStart = this.position;
        const _altMark = this.markEventState();
        try {
    this.consume('TOKEN__3E__3D_');
          _matchedAlt = true;
        } catch (e) {
          this.position = _altStart;
          this.restoreEventState(_altMark);
        }
      }
      if (!_matchedAlt) {
        const _altStart = this.position;
        const _altMark = this.markEventState();
        try {
    this.consume('TOKEN_instanceof');
          _matchedAlt = true;
        } catch (e) {
          this.position = _altStart;
          this.restoreEventState(_altMark);
        }
      }
      if (!_matchedAlt) { throw __BACKTRACK_ERROR; }
    }
    this.parseshiftExpression();
      } catch (e) {
        this.position = _loopStart;
        this.restoreEventState(_loopMark);
        break;
      }
      if (this.position === _loopStart) break;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('relationalExpressionNoIn', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('relationalExpressionNoIn', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsevariableDeclarationListNoIn() {
    const __memoStart = this.position;
    const __memoKey = 'variableDeclarationListNoIn@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('variableDeclarationListNoIn', this.position);
    }
    let __ok = false;
    try {
    this.parsevariableDeclarationNoIn();
    // Group *
    while (true) {
      const _loopStart = this.position;
      const _loopMark = this.markEventState();
      try {
    this.consume('TOKEN__2C_');
    this.parsevariableDeclarationNoIn();
      } catch (e) {
        this.position = _loopStart;
        this.restoreEventState(_loopMark);
        break;
      }
      if (this.position === _loopStart) break;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('variableDeclarationListNoIn', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('variableDeclarationListNoIn', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsevariableDeclarationNoIn() {
    const __memoStart = this.position;
    const __memoKey = 'variableDeclarationNoIn@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('variableDeclarationNoIn', this.position);
    }
    let __ok = false;
    try {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parsebindingIdentifier();
    // Optional: try parsing initializerNoIn
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      try {
        this.parseinitializerNoIn();
      } catch(e) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parsebindingPattern();
    // Optional: try parsing initializerNoIn
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      try {
        this.parseinitializerNoIn();
      } catch(e) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      throw __BACKTRACK_ERROR;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('variableDeclarationNoIn', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('variableDeclarationNoIn', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parseinitializerNoIn() {
    const __memoStart = this.position;
    const __memoKey = 'initializerNoIn@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('initializerNoIn', this.position);
    }
    let __ok = false;
    try {
    this.consume('TOKEN__3D_');
    this.parseassignmentExpressionNoIn();

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('initializerNoIn', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('initializerNoIn', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsecontinueStatement() {
    const __memoStart = this.position;
    const __memoKey = 'continueStatement@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('continueStatement', this.position);
    }
    let __ok = false;
    try {
    this.consume('TOKEN_continue');
    // Optional: try parsing identifier
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      try {
        this.parseidentifier();
      } catch(e) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
    this.parsesemicolon();

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('continueStatement', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('continueStatement', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsebreakStatement() {
    const __memoStart = this.position;
    const __memoKey = 'breakStatement@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('breakStatement', this.position);
    }
    let __ok = false;
    try {
    this.consume('TOKEN_break');
    // Optional: try parsing identifier
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      try {
        this.parseidentifier();
      } catch(e) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
    this.parsesemicolon();

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('breakStatement', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('breakStatement', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsereturnStatement() {
    const __memoStart = this.position;
    const __memoKey = 'returnStatement@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('returnStatement', this.position);
    }
    let __ok = false;
    try {
    this.consume('TOKEN_return');
    // Optional: try parsing expression
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      try {
        this.parseexpression();
      } catch(e) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
    this.parsesemicolon();

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('returnStatement', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('returnStatement', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsewithStatement() {
    const __memoStart = this.position;
    const __memoKey = 'withStatement@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('withStatement', this.position);
    }
    let __ok = false;
    try {
    this.consume('TOKEN_with');
    this.consume('TOKEN__28_');
    this.parseexpression();
    this.consume('TOKEN__29_');
    this.parsestatement();

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('withStatement', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('withStatement', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parselabelledStatement() {
    const __memoStart = this.position;
    const __memoKey = 'labelledStatement@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('labelledStatement', this.position);
    }
    let __ok = false;
    try {
    this.parseidentifier();
    this.consume('TOKEN__3A_');
    this.parsestatement();

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('labelledStatement', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('labelledStatement', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parseswitchStatement() {
    const __memoStart = this.position;
    const __memoKey = 'switchStatement@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('switchStatement', this.position);
    }
    let __ok = false;
    try {
    this.consume('TOKEN_switch');
    this.consume('TOKEN__28_');
    this.parseexpression();
    this.consume('TOKEN__29_');
    this.parsecaseBlock();

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('switchStatement', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('switchStatement', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsecaseBlock() {
    const __memoStart = this.position;
    const __memoKey = 'caseBlock@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('caseBlock', this.position);
    }
    let __ok = false;
    try {
    this.consume('TOKEN__7B_');
    while (true) {
      const savePos = this.position;
      const saveMark = this.markEventState();
      try {
        this.parsecaseClause();
        if (this.position === savePos) break;
      } catch(e) {
        this.position = savePos;
        this.restoreEventState(saveMark);
        break;
      }
    }
    // Group ?
    {
      const _optStart = this.position;
      const _optMark = this.markEventState();
      try {
    this.parsedefaultClause();
    while (true) {
      const savePos = this.position;
      const saveMark = this.markEventState();
      try {
        this.parsecaseClause();
        if (this.position === savePos) break;
      } catch(e) {
        this.position = savePos;
        this.restoreEventState(saveMark);
        break;
      }
    }
      } catch (e) {
        this.position = _optStart;
        this.restoreEventState(_optMark);
      }
    }
    this.consume('TOKEN__7D_');

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('caseBlock', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('caseBlock', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsecaseClause() {
    const __memoStart = this.position;
    const __memoKey = 'caseClause@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('caseClause', this.position);
    }
    let __ok = false;
    try {
    this.consume('TOKEN_case');
    this.parseexpression();
    this.consume('TOKEN__3A_');
    while (true) {
      const savePos = this.position;
      const saveMark = this.markEventState();
      try {
        this.parsestatement();
        if (this.position === savePos) break;
      } catch(e) {
        this.position = savePos;
        this.restoreEventState(saveMark);
        break;
      }
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('caseClause', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('caseClause', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsedefaultClause() {
    const __memoStart = this.position;
    const __memoKey = 'defaultClause@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('defaultClause', this.position);
    }
    let __ok = false;
    try {
    this.consume('TOKEN_default');
    this.consume('TOKEN__3A_');
    while (true) {
      const savePos = this.position;
      const saveMark = this.markEventState();
      try {
        this.parsestatement();
        if (this.position === savePos) break;
      } catch(e) {
        this.position = savePos;
        this.restoreEventState(saveMark);
        break;
      }
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('defaultClause', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('defaultClause', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsethrowStatement() {
    const __memoStart = this.position;
    const __memoKey = 'throwStatement@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('throwStatement', this.position);
    }
    let __ok = false;
    try {
    this.consume('TOKEN_throw');
    this.parseexpression();
    this.parsesemicolon();

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('throwStatement', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('throwStatement', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsetryStatement() {
    const __memoStart = this.position;
    const __memoKey = 'tryStatement@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('tryStatement', this.position);
    }
    let __ok = false;
    try {
    this.consume('TOKEN_try');
    this.parseblock();
    // Group
    {
      let _matchedAlt = false;
      if (!_matchedAlt) {
        const _altStart = this.position;
        const _altMark = this.markEventState();
        try {
    this.parsecatch();
    // Optional: try parsing finally
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      try {
        this.parsefinally();
      } catch(e) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
          _matchedAlt = true;
        } catch (e) {
          this.position = _altStart;
          this.restoreEventState(_altMark);
        }
      }
      if (!_matchedAlt) {
        const _altStart = this.position;
        const _altMark = this.markEventState();
        try {
    this.parsefinally();
          _matchedAlt = true;
        } catch (e) {
          this.position = _altStart;
          this.restoreEventState(_altMark);
        }
      }
      if (!_matchedAlt) { throw __BACKTRACK_ERROR; }
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('tryStatement', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('tryStatement', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsecatch() {
    const __memoStart = this.position;
    const __memoKey = 'catch@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('catch', this.position);
    }
    let __ok = false;
    try {
    this.consume('TOKEN_catch');
    this.consume('TOKEN__28_');
    this.parseidentifier();
    this.consume('TOKEN__29_');
    this.parseblock();

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('catch', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('catch', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsefinally() {
    const __memoStart = this.position;
    const __memoKey = 'finally@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('finally', this.position);
    }
    let __ok = false;
    try {
    this.consume('TOKEN_finally');
    this.parseblock();

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('finally', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('finally', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsedebuggerStatement() {
    const __memoStart = this.position;
    const __memoKey = 'debuggerStatement@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('debuggerStatement', this.position);
    }
    let __ok = false;
    try {
    this.consume('TOKEN_debugger');
    this.parsesemicolon();

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('debuggerStatement', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('debuggerStatement', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsefunctionDeclaration() {
    const __memoStart = this.position;
    const __memoKey = 'functionDeclaration@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('functionDeclaration', this.position);
    }
    let __ok = false;
    try {
    this.consume('TOKEN_function');
    this.parseidentifier();
    this.consume('TOKEN__28_');
    // Optional: try parsing formalParameterList
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      try {
        this.parseformalParameterList();
      } catch(e) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
    this.consume('TOKEN__29_');
    this.consume('TOKEN__7B_');
    this.parsefunctionBody();
    this.consume('TOKEN__7D_');

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('functionDeclaration', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('functionDeclaration', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parseasyncFunctionDeclaration() {
    const __memoStart = this.position;
    const __memoKey = 'asyncFunctionDeclaration@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('asyncFunctionDeclaration', this.position);
    }
    let __ok = false;
    try {
    this.consume('TOKEN_async');
    this.consume('TOKEN_function');
    this.parseidentifier();
    this.consume('TOKEN__28_');
    // Optional: try parsing formalParameterList
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      try {
        this.parseformalParameterList();
      } catch(e) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
    this.consume('TOKEN__29_');
    this.consume('TOKEN__7B_');
    this.parseasyncFunctionBody();
    this.consume('TOKEN__7D_');

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('asyncFunctionDeclaration', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('asyncFunctionDeclaration', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsegeneratorDeclaration() {
    const __memoStart = this.position;
    const __memoKey = 'generatorDeclaration@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('generatorDeclaration', this.position);
    }
    let __ok = false;
    try {
    this.consume('TOKEN_function');
    this.consume('TOKEN__2A_');
    this.parseidentifier();
    this.consume('TOKEN__28_');
    // Optional: try parsing formalParameterList
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      try {
        this.parseformalParameterList();
      } catch(e) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
    this.consume('TOKEN__29_');
    this.consume('TOKEN__7B_');
    this.parsegeneratorBody();
    this.consume('TOKEN__7D_');

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('generatorDeclaration', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('generatorDeclaration', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsegeneratorExpression() {
    const __memoStart = this.position;
    const __memoKey = 'generatorExpression@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('generatorExpression', this.position);
    }
    let __ok = false;
    try {
    this.consume('TOKEN_function');
    this.consume('TOKEN__2A_');
    // Optional: try parsing identifier
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      try {
        this.parseidentifier();
      } catch(e) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
    this.consume('TOKEN__28_');
    // Optional: try parsing formalParameterList
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      try {
        this.parseformalParameterList();
      } catch(e) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
    this.consume('TOKEN__29_');
    this.consume('TOKEN__7B_');
    this.parsegeneratorBody();
    this.consume('TOKEN__7D_');

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('generatorExpression', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('generatorExpression', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsegeneratorBody() {
    const __memoStart = this.position;
    const __memoKey = 'generatorBody@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('generatorBody', this.position);
    }
    let __ok = false;
    try {
    this.parsefunctionBody();

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('generatorBody', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('generatorBody', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parseasyncFunctionBody() {
    const __memoStart = this.position;
    const __memoKey = 'asyncFunctionBody@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('asyncFunctionBody', this.position);
    }
    let __ok = false;
    try {
    this.parsefunctionBody();

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('asyncFunctionBody', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('asyncFunctionBody', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parseclassDeclaration() {
    const __memoStart = this.position;
    const __memoKey = 'classDeclaration@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('classDeclaration', this.position);
    }
    let __ok = false;
    try {
    this.consume('TOKEN_class');
    this.parseidentifier();
    this.parseclassTail();

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('classDeclaration', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('classDeclaration', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parseclassTail() {
    const __memoStart = this.position;
    const __memoKey = 'classTail@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('classTail', this.position);
    }
    let __ok = false;
    try {
    // Optional: try parsing classHeritage
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      try {
        this.parseclassHeritage();
      } catch(e) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
    this.consume('TOKEN__7B_');
    // Optional: try parsing classBody
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      try {
        this.parseclassBody();
      } catch(e) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
    this.consume('TOKEN__7D_');

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('classTail', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('classTail', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parseclassHeritage() {
    const __memoStart = this.position;
    const __memoKey = 'classHeritage@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('classHeritage', this.position);
    }
    let __ok = false;
    try {
    this.consume('TOKEN_extends');
    this.parseleftHandSideExpression();

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('classHeritage', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('classHeritage', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parseclassBody() {
    const __memoStart = this.position;
    const __memoKey = 'classBody@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('classBody', this.position);
    }
    let __ok = false;
    try {
    let count = 0;
    while (true) {
      const savePos = this.position;
      const saveMark = this.markEventState();
      try {
        this.parseclassElement();
        if (this.position === savePos) break;
        count++;
      } catch(e) {
        this.position = savePos;
        this.restoreEventState(saveMark);
        break;
      }
    }
    if (count === 0) {
      throw __BACKTRACK_ERROR;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('classBody', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('classBody', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parseclassElement() {
    const __memoStart = this.position;
    const __memoKey = 'classElement@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('classElement', this.position);
    }
    let __ok = false;
    try {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parsemethodDefinition();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN_static');
    this.parsemethodDefinition();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN__3B_');
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      throw __BACKTRACK_ERROR;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('classElement', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('classElement', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsemethodDefinition() {
    const __memoStart = this.position;
    const __memoKey = 'methodDefinition@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('methodDefinition', this.position);
    }
    let __ok = false;
    try {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parsepropertyName();
    this.consume('TOKEN__28_');
    // Optional: try parsing formalParameterList
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      try {
        this.parseformalParameterList();
      } catch(e) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
    this.consume('TOKEN__29_');
    this.consume('TOKEN__7B_');
    this.parsefunctionBody();
    this.consume('TOKEN__7D_');
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN__2A_');
    this.parsepropertyName();
    this.consume('TOKEN__28_');
    // Optional: try parsing formalParameterList
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      try {
        this.parseformalParameterList();
      } catch(e) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
    this.consume('TOKEN__29_');
    this.consume('TOKEN__7B_');
    this.parsegeneratorBody();
    this.consume('TOKEN__7D_');
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN_async');
    this.parsepropertyName();
    this.consume('TOKEN__28_');
    // Optional: try parsing formalParameterList
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      try {
        this.parseformalParameterList();
      } catch(e) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
    this.consume('TOKEN__29_');
    this.consume('TOKEN__7B_');
    this.parseasyncFunctionBody();
    this.consume('TOKEN__7D_');
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN_get');
    this.consume('TOKEN__28_');
    // Optional: try parsing formalParameterList
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      try {
        this.parseformalParameterList();
      } catch(e) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
    this.consume('TOKEN__29_');
    this.consume('TOKEN__7B_');
    this.parsefunctionBody();
    this.consume('TOKEN__7D_');
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN_set');
    this.consume('TOKEN__28_');
    // Optional: try parsing formalParameterList
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      try {
        this.parseformalParameterList();
      } catch(e) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
    this.consume('TOKEN__29_');
    this.consume('TOKEN__7B_');
    this.parsefunctionBody();
    this.consume('TOKEN__7D_');
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN_get');
    this.parsepropertyName();
    this.consume('TOKEN__28_');
    this.consume('TOKEN__29_');
    this.consume('TOKEN__7B_');
    this.parsefunctionBody();
    this.consume('TOKEN__7D_');
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN_set');
    this.parsepropertyName();
    this.consume('TOKEN__28_');
    this.parsepropertySetParameterList();
    this.consume('TOKEN__29_');
    this.consume('TOKEN__7B_');
    this.parsefunctionBody();
    this.consume('TOKEN__7D_');
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      throw __BACKTRACK_ERROR;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('methodDefinition', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('methodDefinition', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsepropertyDefinition() {
    const __memoStart = this.position;
    const __memoKey = 'propertyDefinition@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('propertyDefinition', this.position);
    }
    let __ok = false;
    try {
    this.parseidentifier();
    this.consume('TOKEN__3D_');
    this.parseassignmentExpression();
    this.consume('TOKEN__3B_');

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('propertyDefinition', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('propertyDefinition', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsesuperProperty() {
    const __memoStart = this.position;
    const __memoKey = 'superProperty@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('superProperty', this.position);
    }
    let __ok = false;
    try {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN_super');
    this.consume('TOKEN__5B_');
    this.parseexpression();
    this.consume('TOKEN__5D_');
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN_super');
    this.consume('TOKEN__2E_');
    this.parsepropertyIdentifierName();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      throw __BACKTRACK_ERROR;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('superProperty', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('superProperty', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsesuperCall() {
    const __memoStart = this.position;
    const __memoKey = 'superCall@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('superCall', this.position);
    }
    let __ok = false;
    try {
    this.consume('TOKEN_super');
    this.parsearguments();

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('superCall', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('superCall', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsemetaProperty() {
    const __memoStart = this.position;
    const __memoKey = 'metaProperty@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('metaProperty', this.position);
    }
    let __ok = false;
    try {
    this.consume('TOKEN_new');
    this.consume('TOKEN__2E_');
    this.consume('TOKEN_target');

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('metaProperty', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('metaProperty', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsetemplateLiteral() {
    const __memoStart = this.position;
    const __memoKey = 'templateLiteral@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('templateLiteral', this.position);
    }
    let __ok = false;
    try {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('NoSubstitutionTemplate');
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TemplateHead');
    this.parseexpression();
    this.parsetemplateSpans();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      throw __BACKTRACK_ERROR;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('templateLiteral', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('templateLiteral', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsetemplateSpans() {
    const __memoStart = this.position;
    const __memoKey = 'templateSpans@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('templateSpans', this.position);
    }
    let __ok = false;
    try {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TemplateTail');
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TemplateMiddle');
    this.parseexpression();
    this.parsetemplateSpans();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      throw __BACKTRACK_ERROR;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('templateSpans', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('templateSpans', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parseimportDeclaration() {
    const __memoStart = this.position;
    const __memoKey = 'importDeclaration@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('importDeclaration', this.position);
    }
    let __ok = false;
    try {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN_import');
    this.parseimportClause();
    this.parsefromClause();
    this.parsesemicolon();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN_import');
    this.parsemoduleSpecifier();
    this.parsesemicolon();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      throw __BACKTRACK_ERROR;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('importDeclaration', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('importDeclaration', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parseimportClause() {
    const __memoStart = this.position;
    const __memoKey = 'importClause@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('importClause', this.position);
    }
    let __ok = false;
    try {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parseimportedDefaultBinding();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parsenameSpaceImport();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parsenamedImports();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parseimportedDefaultBinding();
    this.consume('TOKEN__2C_');
    this.parsenameSpaceImport();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parseimportedDefaultBinding();
    this.consume('TOKEN__2C_');
    this.parsenamedImports();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      throw __BACKTRACK_ERROR;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('importClause', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('importClause', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parseimportedDefaultBinding() {
    const __memoStart = this.position;
    const __memoKey = 'importedDefaultBinding@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('importedDefaultBinding', this.position);
    }
    let __ok = false;
    try {
    this.parseimportedBinding();

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('importedDefaultBinding', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('importedDefaultBinding', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsenameSpaceImport() {
    const __memoStart = this.position;
    const __memoKey = 'nameSpaceImport@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('nameSpaceImport', this.position);
    }
    let __ok = false;
    try {
    this.consume('TOKEN__2A_');
    this.consume('TOKEN_as');
    this.parseimportedBinding();

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('nameSpaceImport', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('nameSpaceImport', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsenamedImports() {
    const __memoStart = this.position;
    const __memoKey = 'namedImports@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('namedImports', this.position);
    }
    let __ok = false;
    try {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN__7B_');
    this.consume('TOKEN__7D_');
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN__7B_');
    this.parseimportsList();
    this.consume('TOKEN__7D_');
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN__7B_');
    this.parseimportsList();
    this.consume('TOKEN__2C_');
    this.consume('TOKEN__7D_');
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      throw __BACKTRACK_ERROR;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('namedImports', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('namedImports', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsefromClause() {
    const __memoStart = this.position;
    const __memoKey = 'fromClause@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('fromClause', this.position);
    }
    let __ok = false;
    try {
    this.consume('TOKEN_from');
    this.parsemoduleSpecifier();

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('fromClause', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('fromClause', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parseimportsList() {
    const __memoStart = this.position;
    const __memoKey = 'importsList@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('importsList', this.position);
    }
    let __ok = false;
    try {
    this.parseimportSpecifier();
    // Group *
    while (true) {
      const _loopStart = this.position;
      const _loopMark = this.markEventState();
      try {
    this.consume('TOKEN__2C_');
    this.parseimportSpecifier();
      } catch (e) {
        this.position = _loopStart;
        this.restoreEventState(_loopMark);
        break;
      }
      if (this.position === _loopStart) break;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('importsList', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('importsList', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parseimportSpecifier() {
    const __memoStart = this.position;
    const __memoKey = 'importSpecifier@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('importSpecifier', this.position);
    }
    let __ok = false;
    try {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parseimportedBinding();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parseidentifier();
    this.consume('TOKEN_as');
    this.parseimportedBinding();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      throw __BACKTRACK_ERROR;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('importSpecifier', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('importSpecifier', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsemoduleSpecifier() {
    const __memoStart = this.position;
    const __memoKey = 'moduleSpecifier@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('moduleSpecifier', this.position);
    }
    let __ok = false;
    try {
    this.parsestringLiteral();

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('moduleSpecifier', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('moduleSpecifier', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parseimportedBinding() {
    const __memoStart = this.position;
    const __memoKey = 'importedBinding@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('importedBinding', this.position);
    }
    let __ok = false;
    try {
    this.parsebindingIdentifier();

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('importedBinding', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('importedBinding', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parseexportDeclaration() {
    const __memoStart = this.position;
    const __memoKey = 'exportDeclaration@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('exportDeclaration', this.position);
    }
    let __ok = false;
    try {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN_export');
    this.consume('TOKEN__2A_');
    this.parsefromClause();
    this.parsesemicolon();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN_export');
    this.parseexportClause();
    this.parsefromClause();
    this.parsesemicolon();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN_export');
    this.parseexportClause();
    this.parsesemicolon();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN_export');
    this.parsevariableStatement();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN_export');
    this.parsefunctionDeclaration();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN_export');
    this.parsegeneratorDeclaration();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN_export');
    this.parseasyncFunctionDeclaration();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN_export');
    this.parseclassDeclaration();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN_export');
    this.parselexicalDeclaration();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN_export');
    this.consume('TOKEN_default');
    this.parsefunctionDeclaration();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN_export');
    this.consume('TOKEN_default');
    this.parsegeneratorDeclaration();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN_export');
    this.consume('TOKEN_default');
    this.parseasyncFunctionDeclaration();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN_export');
    this.consume('TOKEN_default');
    this.parseclassDeclaration();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN_export');
    this.consume('TOKEN_default');
    this.parseassignmentExpression();
    this.parsesemicolon();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      throw __BACKTRACK_ERROR;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('exportDeclaration', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('exportDeclaration', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parseexportClause() {
    const __memoStart = this.position;
    const __memoKey = 'exportClause@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('exportClause', this.position);
    }
    let __ok = false;
    try {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN__7B_');
    this.consume('TOKEN__7D_');
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN__7B_');
    this.parseexportsList();
    this.consume('TOKEN__7D_');
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN__7B_');
    this.parseexportsList();
    this.consume('TOKEN__2C_');
    this.consume('TOKEN__7D_');
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      throw __BACKTRACK_ERROR;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('exportClause', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('exportClause', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parseexportsList() {
    const __memoStart = this.position;
    const __memoKey = 'exportsList@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('exportsList', this.position);
    }
    let __ok = false;
    try {
    this.parseexportSpecifier();
    // Group *
    while (true) {
      const _loopStart = this.position;
      const _loopMark = this.markEventState();
      try {
    this.consume('TOKEN__2C_');
    this.parseexportSpecifier();
      } catch (e) {
        this.position = _loopStart;
        this.restoreEventState(_loopMark);
        break;
      }
      if (this.position === _loopStart) break;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('exportsList', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('exportsList', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parseexportSpecifier() {
    const __memoStart = this.position;
    const __memoKey = 'exportSpecifier@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('exportSpecifier', this.position);
    }
    let __ok = false;
    try {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parseidentifier();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parseidentifier();
    this.consume('TOKEN_as');
    this.parseidentifier();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      throw __BACKTRACK_ERROR;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('exportSpecifier', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('exportSpecifier', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsescript() {
    const __memoStart = this.position;
    const __memoKey = 'script@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('script', this.position);
    }
    let __ok = false;
    try {
    // Optional: try parsing scriptBody
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      try {
        this.parsescriptBody();
      } catch(e) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('script', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('script', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsescriptBody() {
    const __memoStart = this.position;
    const __memoKey = 'scriptBody@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('scriptBody', this.position);
    }
    let __ok = false;
    try {
    let count = 0;
    while (true) {
      const savePos = this.position;
      const saveMark = this.markEventState();
      try {
        this.parsesourceElement();
        if (this.position === savePos) break;
        count++;
      } catch(e) {
        this.position = savePos;
        this.restoreEventState(saveMark);
        break;
      }
    }
    if (count === 0) {
      throw __BACKTRACK_ERROR;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('scriptBody', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('scriptBody', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsemodule() {
    const __memoStart = this.position;
    const __memoKey = 'module@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('module', this.position);
    }
    let __ok = false;
    try {
    // Optional: try parsing moduleBody
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      try {
        this.parsemoduleBody();
      } catch(e) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('module', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('module', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsemoduleBody() {
    const __memoStart = this.position;
    const __memoKey = 'moduleBody@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('moduleBody', this.position);
    }
    let __ok = false;
    try {
    let count = 0;
    while (true) {
      const savePos = this.position;
      const saveMark = this.markEventState();
      try {
        this.parsemoduleItem();
        if (this.position === savePos) break;
        count++;
      } catch(e) {
        this.position = savePos;
        this.restoreEventState(saveMark);
        break;
      }
    }
    if (count === 0) {
      throw __BACKTRACK_ERROR;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('moduleBody', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('moduleBody', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsemoduleItem() {
    const __memoStart = this.position;
    const __memoKey = 'moduleItem@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('moduleItem', this.position);
    }
    let __ok = false;
    try {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parseimportDeclaration();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parseexportDeclaration();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parsesourceElement();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      throw __BACKTRACK_ERROR;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('moduleItem', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('moduleItem', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsesemicolon() {
    const __memoStart = this.position;
    const __memoKey = 'semicolon@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('semicolon', this.position);
    }
    let __ok = false;
    try {
    this.consume('TOKEN__3B_');

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('semicolon', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('semicolon', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parsepropertyIdentifierName() {
    const __memoStart = this.position;
    const __memoKey = 'propertyIdentifierName@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('propertyIdentifierName', this.position);
    }
    let __ok = false;
    try {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parseidentifier();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consumeContextual('IdentifierName');
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN_get');
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TOKEN_set');
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      throw __BACKTRACK_ERROR;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('propertyIdentifierName', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('propertyIdentifierName', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parseidentifier() {
    const __memoStart = this.position;
    const __memoKey = 'identifier@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('identifier', this.position);
    }
    let __ok = false;
    try {
    this.consume('Identifier');

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('identifier', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('identifier', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
  parseIgnore() {
    const __memoStart = this.position;
    const __memoKey = 'Ignore@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      throw __BACKTRACK_ERROR;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('Ignore', this.position);
    }
    let __ok = false;
    try {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('WhiteSpace');
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('Comment');
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      throw __BACKTRACK_ERROR;
    }

      __ok = true;
    } finally {
      if (!__ok) {
        if (this.failureMemo.size > 200000) {
          this.failureMemo.clear();
        }
        this.failureMemo.add(__memoKey);
      }
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('Ignore', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('Ignore', this.position);
        }
      }
      if (__ok && this._canMemoSuccess) {
        if (this.successMemo.size > 200000) {
          this.successMemo.clear();
        }
        this.successMemo.set(__memoKey, {
          endPos: this.position,
          node: this.eventHandler ? this.eventHandler.lastClosedNode : null
        });
      }
    }
  }
}

module.exports = Parser;