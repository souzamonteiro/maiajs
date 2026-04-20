class Lexer {
  constructor(input) {
    this.input = input;
    this.position = 0;
    this.tokens = [];
    this.charClassDepth = 0;
    this.tokenPatterns = [    { type: 'TOKEN__7B_', regex: /^\{/ },    { type: 'TOKEN__7D_', regex: /^\}/ },    { type: 'TOKEN_var', regex: /^var/ },    { type: 'TOKEN_let', regex: /^let/ },    { type: 'TOKEN_const', regex: /^const/ },    { type: 'TOKEN__2C_', regex: /^,/ },    { type: 'TOKEN__3D_', regex: /^=/ },    { type: 'TOKEN_yield', regex: /^yield/ },    { type: 'TOKEN__2A_', regex: /^\*/ },    { type: 'TOKEN__3D__3E_', regex: /^=>/ },    { type: 'TOKEN_async', regex: /^async/ },    { type: 'TOKEN__28_', regex: /^\(/ },    { type: 'TOKEN__29_', regex: /^\)/ },    { type: 'TOKEN__3F_', regex: /^\?/ },    { type: 'TOKEN__3A_', regex: /^:/ },    { type: 'TOKEN__7C__7C_', regex: /^\|\|/ },    { type: 'TOKEN__26__26_', regex: /^&&/ },    { type: 'TOKEN__7C_', regex: /^\|/ },    { type: 'TOKEN__5E_', regex: /^\^/ },    { type: 'TOKEN__26_', regex: /^&/ },    { type: 'TOKEN__3D__3D_', regex: /^==/ },    { type: 'TOKEN__21__3D_', regex: /^!=/ },    { type: 'TOKEN__3D__3D__3D_', regex: /^===/ },    { type: 'TOKEN__21__3D__3D_', regex: /^!==/ },    { type: 'TOKEN__3C_', regex: /^</ },    { type: 'TOKEN__3E_', regex: /^>/ },    { type: 'TOKEN__3C__3D_', regex: /^<=/ },    { type: 'TOKEN__3E__3D_', regex: /^>=/ },    { type: 'TOKEN_instanceof', regex: /^instanceof/ },    { type: 'TOKEN_in', regex: /^in/ },    { type: 'TOKEN__3C__3C_', regex: /^<</ },    { type: 'TOKEN__3E__3E_', regex: /^>>/ },    { type: 'TOKEN__3E__3E__3E_', regex: /^>>>/ },    { type: 'TOKEN__2B_', regex: /^\+/ },    { type: 'TOKEN__2D_', regex: /^-/ },    { type: 'TOKEN__2F_', regex: /^\// },    { type: 'TOKEN__25_', regex: /^%/ },    { type: 'TOKEN__2A__2A_', regex: /^\*\*/ },    { type: 'TOKEN_delete', regex: /^delete/ },    { type: 'TOKEN_void', regex: /^void/ },    { type: 'TOKEN_typeof', regex: /^typeof/ },    { type: 'TOKEN__2B__2B_', regex: /^\+\+/ },    { type: 'TOKEN__2D__2D_', regex: /^--/ },    { type: 'TOKEN__7E_', regex: /^~/ },    { type: 'TOKEN__21_', regex: /^!/ },    { type: 'TOKEN_await', regex: /^await/ },    { type: 'TOKEN_new', regex: /^new/ },    { type: 'TOKEN__5B_', regex: /^\[/ },    { type: 'TOKEN__5D_', regex: /^\]/ },    { type: 'TOKEN__2E_', regex: /^\./ },    { type: 'TOKEN_this', regex: /^this/ },    { type: 'TOKEN__2E__2E__2E_', regex: /^\.\.\./ },    { type: 'TOKEN_get', regex: /^get/ },    { type: 'TOKEN_set', regex: /^set/ },    { type: 'TOKEN_function', regex: /^function/ },    { type: 'TOKEN_class', regex: /^class/ },    { type: 'TOKEN__3B_', regex: /^;/ },    { type: 'TOKEN__2A__3D_', regex: /^\*=/ },    { type: 'TOKEN__2F__3D_', regex: /^\/=/ },    { type: 'TOKEN__25__3D_', regex: /^%=/ },    { type: 'TOKEN__2A__2A__3D_', regex: /^\*\*=/ },    { type: 'TOKEN__2B__3D_', regex: /^\+=/ },    { type: 'TOKEN__2D__3D_', regex: /^-=/ },    { type: 'TOKEN__3C__3C__3D_', regex: /^<<=/ },    { type: 'TOKEN__3E__3E__3D_', regex: /^>>=/ },    { type: 'TOKEN__3E__3E__3E__3D_', regex: /^>>>=/ },    { type: 'TOKEN__26__3D_', regex: /^&=/ },    { type: 'TOKEN__5E__3D_', regex: /^\^=/ },    { type: 'TOKEN__7C__3D_', regex: /^\|=/ },    { type: 'TOKEN_if', regex: /^if/ },    { type: 'TOKEN_else', regex: /^else/ },    { type: 'TOKEN_do', regex: /^do/ },    { type: 'TOKEN_while', regex: /^while/ },    { type: 'TOKEN_for', regex: /^for/ },    { type: 'TOKEN_of', regex: /^of/ },    { type: 'TOKEN_continue', regex: /^continue/ },    { type: 'TOKEN_break', regex: /^break/ },    { type: 'TOKEN_return', regex: /^return/ },    { type: 'TOKEN_with', regex: /^with/ },    { type: 'TOKEN_switch', regex: /^switch/ },    { type: 'TOKEN_case', regex: /^case/ },    { type: 'TOKEN_default', regex: /^default/ },    { type: 'TOKEN_throw', regex: /^throw/ },    { type: 'TOKEN_try', regex: /^try/ },    { type: 'TOKEN_catch', regex: /^catch/ },    { type: 'TOKEN_finally', regex: /^finally/ },    { type: 'TOKEN_debugger', regex: /^debugger/ },    { type: 'TOKEN_extends', regex: /^extends/ },    { type: 'TOKEN_static', regex: /^static/ },    { type: 'TOKEN_super', regex: /^super/ },    { type: 'TOKEN_target', regex: /^target/ },    { type: 'TOKEN_import', regex: /^import/ },    { type: 'TOKEN_as', regex: /^as/ },    { type: 'TOKEN_from', regex: /^from/ },    { type: 'TOKEN_export', regex: /^export/ },    { type: 'Identifier', regex: /^(?:(?:[\u0041-\u005a]|[\u0061-\u007a]|[\u00c0-\u00d6]|[\u00d8-\u00f6]|[\u00f8-\u00ff]|[\u0100-\u0131]|[\u0134-\u013e]|[\u0141-\u0148]|[\u014a-\u017e]|[\u0180-\u01c3]|[\u01cd-\u01f0]|[\u01f4-\u01f5]|[\u01fa-\u0217]|[\u0250-\u02a8]|[\u02bb-\u02c1]|Ά|[\u0388-\u038a]|Ό|[\u038e-\u03a1]|[\u03a3-\u03ce]|[\u03d0-\u03d6]|Ϛ|Ϝ|Ϟ|Ϡ|[\u03e2-\u03f3]|[\u0401-\u040c]|[\u040e-\u044f]|[\u0451-\u045c]|[\u045e-\u0481]|[\u0490-\u04c4]|[\u04c7-\u04c8]|[\u04cb-\u04cc]|[\u04d0-\u04eb]|[\u04ee-\u04f5]|[\u04f8-\u04f9]|[\u0531-\u0556]|ՙ|[\u0561-\u0586]|[\u05d0-\u05ea]|[\u05f0-\u05f2]|[\u0621-\u063a]|[\u0641-\u064a]|[\u0671-\u06b7]|[\u06ba-\u06be]|[\u06c0-\u06ce]|[\u06d0-\u06d3]|ە|[\u06e5-\u06e6]|[\u0905-\u0939]|ऽ|[\u0958-\u0961]|[\u0985-\u098c]|[\u098f-\u0990]|[\u0993-\u09a8]|[\u09aa-\u09b0]|ল|[\u09b6-\u09b9]|[\u09dc-\u09dd]|[\u09df-\u09e1]|[\u09f0-\u09f1]|[\u0a05-\u0a0a]|[\u0a0f-\u0a10]|[\u0a13-\u0a28]|[\u0a2a-\u0a30]|[\u0a32-\u0a33]|[\u0a35-\u0a36]|[\u0a38-\u0a39]|[\u0a59-\u0a5c]|ਫ਼|[\u0a72-\u0a74]|[\u0a85-\u0a8b]|ઍ|[\u0a8f-\u0a91]|[\u0a93-\u0aa8]|[\u0aaa-\u0ab0]|[\u0ab2-\u0ab3]|[\u0ab5-\u0ab9]|ઽ|ૠ|[\u0b05-\u0b0c]|[\u0b0f-\u0b10]|[\u0b13-\u0b28]|[\u0b2a-\u0b30]|[\u0b32-\u0b33]|[\u0b36-\u0b39]|ଽ|[\u0b5c-\u0b5d]|[\u0b5f-\u0b61]|[\u0b85-\u0b8a]|[\u0b8e-\u0b90]|[\u0b92-\u0b95]|[\u0b99-\u0b9a]|ஜ|[\u0b9e-\u0b9f]|[\u0ba3-\u0ba4]|[\u0ba8-\u0baa]|[\u0bae-\u0bb5]|[\u0bb7-\u0bb9]|[\u0c05-\u0c0c]|[\u0c0e-\u0c10]|[\u0c12-\u0c28]|[\u0c2a-\u0c33]|[\u0c35-\u0c39]|[\u0c60-\u0c61]|[\u0c85-\u0c8c]|[\u0c8e-\u0c90]|[\u0c92-\u0ca8]|[\u0caa-\u0cb3]|[\u0cb5-\u0cb9]|ೞ|[\u0ce0-\u0ce1]|[\u0d05-\u0d0c]|[\u0d0e-\u0d10]|[\u0d12-\u0d28]|[\u0d2a-\u0d39]|[\u0d60-\u0d61]|[\u0e01-\u0e2e]|ะ|[\u0e32-\u0e33]|[\u0e40-\u0e45]|[\u0e81-\u0e82]|ຄ|[\u0e87-\u0e88]|ຊ|ຍ|[\u0e94-\u0e97]|[\u0e99-\u0e9f]|[\u0ea1-\u0ea3]|ລ|ວ|[\u0eaa-\u0eab]|[\u0ead-\u0eae]|ະ|[\u0eb2-\u0eb3]|ຽ|[\u0ec0-\u0ec4]|[\u0f40-\u0f47]|[\u0f49-\u0f69]|[\u10a0-\u10c5]|[\u10d0-\u10f6]|ᄀ|[\u1102-\u1103]|[\u1105-\u1107]|ᄉ|[\u110b-\u110c]|[\u110e-\u1112]|ᄼ|ᄾ|ᅀ|ᅌ|ᅎ|ᅐ|[\u1154-\u1155]|ᅙ|[\u115f-\u1161]|ᅣ|ᅥ|ᅧ|ᅩ|[\u116d-\u116e]|[\u1172-\u1173]|ᅵ|ᆞ|ᆨ|ᆫ|[\u11ae-\u11af]|[\u11b7-\u11b8]|ᆺ|[\u11bc-\u11c2]|ᇫ|ᇰ|ᇹ|[\u1e00-\u1e9b]|[\u1ea0-\u1ef9]|[\u1f00-\u1f15]|[\u1f18-\u1f1d]|[\u1f20-\u1f45]|[\u1f48-\u1f4d]|[\u1f50-\u1f57]|Ὑ|Ὓ|Ὕ|[\u1f5f-\u1f7d]|[\u1f80-\u1fb4]|[\u1fb6-\u1fbc]|ι|[\u1fc2-\u1fc4]|[\u1fc6-\u1fcc]|[\u1fd0-\u1fd3]|[\u1fd6-\u1fdb]|[\u1fe0-\u1fec]|[\u1ff2-\u1ff4]|[\u1ff6-\u1ffc]|Ω|[\u212a-\u212b]|℮|[\u2180-\u2182]|[\u3041-\u3094]|[\u30a1-\u30fa]|[\u3105-\u312c]|[\uac00-\ud7a3]|[\u4e00-\u9fa5]|〇|[\u3021-\u3029])|\$|_|\\u[0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F])(?:(?:(?:(?:[\u0041-\u005a]|[\u0061-\u007a]|[\u00c0-\u00d6]|[\u00d8-\u00f6]|[\u00f8-\u00ff]|[\u0100-\u0131]|[\u0134-\u013e]|[\u0141-\u0148]|[\u014a-\u017e]|[\u0180-\u01c3]|[\u01cd-\u01f0]|[\u01f4-\u01f5]|[\u01fa-\u0217]|[\u0250-\u02a8]|[\u02bb-\u02c1]|Ά|[\u0388-\u038a]|Ό|[\u038e-\u03a1]|[\u03a3-\u03ce]|[\u03d0-\u03d6]|Ϛ|Ϝ|Ϟ|Ϡ|[\u03e2-\u03f3]|[\u0401-\u040c]|[\u040e-\u044f]|[\u0451-\u045c]|[\u045e-\u0481]|[\u0490-\u04c4]|[\u04c7-\u04c8]|[\u04cb-\u04cc]|[\u04d0-\u04eb]|[\u04ee-\u04f5]|[\u04f8-\u04f9]|[\u0531-\u0556]|ՙ|[\u0561-\u0586]|[\u05d0-\u05ea]|[\u05f0-\u05f2]|[\u0621-\u063a]|[\u0641-\u064a]|[\u0671-\u06b7]|[\u06ba-\u06be]|[\u06c0-\u06ce]|[\u06d0-\u06d3]|ە|[\u06e5-\u06e6]|[\u0905-\u0939]|ऽ|[\u0958-\u0961]|[\u0985-\u098c]|[\u098f-\u0990]|[\u0993-\u09a8]|[\u09aa-\u09b0]|ল|[\u09b6-\u09b9]|[\u09dc-\u09dd]|[\u09df-\u09e1]|[\u09f0-\u09f1]|[\u0a05-\u0a0a]|[\u0a0f-\u0a10]|[\u0a13-\u0a28]|[\u0a2a-\u0a30]|[\u0a32-\u0a33]|[\u0a35-\u0a36]|[\u0a38-\u0a39]|[\u0a59-\u0a5c]|ਫ਼|[\u0a72-\u0a74]|[\u0a85-\u0a8b]|ઍ|[\u0a8f-\u0a91]|[\u0a93-\u0aa8]|[\u0aaa-\u0ab0]|[\u0ab2-\u0ab3]|[\u0ab5-\u0ab9]|ઽ|ૠ|[\u0b05-\u0b0c]|[\u0b0f-\u0b10]|[\u0b13-\u0b28]|[\u0b2a-\u0b30]|[\u0b32-\u0b33]|[\u0b36-\u0b39]|ଽ|[\u0b5c-\u0b5d]|[\u0b5f-\u0b61]|[\u0b85-\u0b8a]|[\u0b8e-\u0b90]|[\u0b92-\u0b95]|[\u0b99-\u0b9a]|ஜ|[\u0b9e-\u0b9f]|[\u0ba3-\u0ba4]|[\u0ba8-\u0baa]|[\u0bae-\u0bb5]|[\u0bb7-\u0bb9]|[\u0c05-\u0c0c]|[\u0c0e-\u0c10]|[\u0c12-\u0c28]|[\u0c2a-\u0c33]|[\u0c35-\u0c39]|[\u0c60-\u0c61]|[\u0c85-\u0c8c]|[\u0c8e-\u0c90]|[\u0c92-\u0ca8]|[\u0caa-\u0cb3]|[\u0cb5-\u0cb9]|ೞ|[\u0ce0-\u0ce1]|[\u0d05-\u0d0c]|[\u0d0e-\u0d10]|[\u0d12-\u0d28]|[\u0d2a-\u0d39]|[\u0d60-\u0d61]|[\u0e01-\u0e2e]|ะ|[\u0e32-\u0e33]|[\u0e40-\u0e45]|[\u0e81-\u0e82]|ຄ|[\u0e87-\u0e88]|ຊ|ຍ|[\u0e94-\u0e97]|[\u0e99-\u0e9f]|[\u0ea1-\u0ea3]|ລ|ວ|[\u0eaa-\u0eab]|[\u0ead-\u0eae]|ະ|[\u0eb2-\u0eb3]|ຽ|[\u0ec0-\u0ec4]|[\u0f40-\u0f47]|[\u0f49-\u0f69]|[\u10a0-\u10c5]|[\u10d0-\u10f6]|ᄀ|[\u1102-\u1103]|[\u1105-\u1107]|ᄉ|[\u110b-\u110c]|[\u110e-\u1112]|ᄼ|ᄾ|ᅀ|ᅌ|ᅎ|ᅐ|[\u1154-\u1155]|ᅙ|[\u115f-\u1161]|ᅣ|ᅥ|ᅧ|ᅩ|[\u116d-\u116e]|[\u1172-\u1173]|ᅵ|ᆞ|ᆨ|ᆫ|[\u11ae-\u11af]|[\u11b7-\u11b8]|ᆺ|[\u11bc-\u11c2]|ᇫ|ᇰ|ᇹ|[\u1e00-\u1e9b]|[\u1ea0-\u1ef9]|[\u1f00-\u1f15]|[\u1f18-\u1f1d]|[\u1f20-\u1f45]|[\u1f48-\u1f4d]|[\u1f50-\u1f57]|Ὑ|Ὓ|Ὕ|[\u1f5f-\u1f7d]|[\u1f80-\u1fb4]|[\u1fb6-\u1fbc]|ι|[\u1fc2-\u1fc4]|[\u1fc6-\u1fcc]|[\u1fd0-\u1fd3]|[\u1fd6-\u1fdb]|[\u1fe0-\u1fec]|[\u1ff2-\u1ff4]|[\u1ff6-\u1ffc]|Ω|[\u212a-\u212b]|℮|[\u2180-\u2182]|[\u3041-\u3094]|[\u30a1-\u30fa]|[\u3105-\u312c]|[\uac00-\ud7a3]|[\u4e00-\u9fa5]|〇|[\u3021-\u3029])|\$|_|\\u[0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F])|(?:[\u0300-\u0345]|[\u0360-\u0361]|[\u0483-\u0486]|[\u0591-\u05a1]|[\u05a3-\u05b9]|[\u05bb-\u05bd]|ֿ|[\u05c1-\u05c2]|ׄ|[\u064b-\u0652]|ٰ|[\u06d6-\u06dc]|[\u06dd-\u06df]|[\u06e0-\u06e4]|[\u06e7-\u06e8]|[\u06ea-\u06ed]|[\u0901-\u0903]|़|[\u093e-\u094c]|्|[\u0951-\u0954]|[\u0962-\u0963]|[\u0981-\u0983]|়|া|ি|[\u09c0-\u09c4]|[\u09c7-\u09c8]|[\u09cb-\u09cd]|ৗ|[\u09e2-\u09e3]|ਂ|਼|ਾ|ਿ|[\u0a40-\u0a42]|[\u0a47-\u0a48]|[\u0a4b-\u0a4d]|[\u0a70-\u0a71]|[\u0a81-\u0a83]|઼|[\u0abe-\u0ac5]|[\u0ac7-\u0ac9]|[\u0acb-\u0acd]|[\u0b01-\u0b03]|଼|[\u0b3e-\u0b43]|[\u0b47-\u0b48]|[\u0b4b-\u0b4d]|[\u0b56-\u0b57]|[\u0b82-\u0b83]|[\u0bbe-\u0bc2]|[\u0bc6-\u0bc8]|[\u0bca-\u0bcd]|ௗ|[\u0c01-\u0c03]|[\u0c3e-\u0c44]|[\u0c46-\u0c48]|[\u0c4a-\u0c4d]|[\u0c55-\u0c56]|[\u0c82-\u0c83]|[\u0cbe-\u0cc4]|[\u0cc6-\u0cc8]|[\u0cca-\u0ccd]|[\u0cd5-\u0cd6]|[\u0d02-\u0d03]|[\u0d3e-\u0d43]|[\u0d46-\u0d48]|[\u0d4a-\u0d4d]|ൗ|ั|[\u0e34-\u0e3a]|[\u0e47-\u0e4e]|ັ|[\u0eb4-\u0eb9]|[\u0ebb-\u0ebc]|[\u0ec8-\u0ecd]|[\u0f18-\u0f19]|༵|༷|༹|༾|༿|[\u0f71-\u0f84]|[\u0f86-\u0f8b]|[\u0f90-\u0f95]|ྗ|[\u0f99-\u0fad]|[\u0fb1-\u0fb7]|ྐྵ|[\u20d0-\u20dc]|⃡|[\u302a-\u302f]|゙|゚)|(?:[\u0030-\u0039]|[\u0660-\u0669]|[\u06f0-\u06f9]|[\u0966-\u096f]|[\u09e6-\u09ef]|[\u0a66-\u0a6f]|[\u0ae6-\u0aef]|[\u0b66-\u0b6f]|[\u0be7-\u0bef]|[\u0c66-\u0c6f]|[\u0ce6-\u0cef]|[\u0d66-\u0d6f]|[\u0e50-\u0e59]|[\u0ed0-\u0ed9]|[\u0f20-\u0f29])|(?:·|ː|ˑ|·|ـ|ๆ|ໆ|々|[\u3031-\u3035]|[\u309d-\u309e]|[\u30fc-\u30fe])|‌|‍))*/ },    { type: 'IdentifierName', regex: /^(?:(?:[\u0041-\u005a]|[\u0061-\u007a]|[\u00c0-\u00d6]|[\u00d8-\u00f6]|[\u00f8-\u00ff]|[\u0100-\u0131]|[\u0134-\u013e]|[\u0141-\u0148]|[\u014a-\u017e]|[\u0180-\u01c3]|[\u01cd-\u01f0]|[\u01f4-\u01f5]|[\u01fa-\u0217]|[\u0250-\u02a8]|[\u02bb-\u02c1]|Ά|[\u0388-\u038a]|Ό|[\u038e-\u03a1]|[\u03a3-\u03ce]|[\u03d0-\u03d6]|Ϛ|Ϝ|Ϟ|Ϡ|[\u03e2-\u03f3]|[\u0401-\u040c]|[\u040e-\u044f]|[\u0451-\u045c]|[\u045e-\u0481]|[\u0490-\u04c4]|[\u04c7-\u04c8]|[\u04cb-\u04cc]|[\u04d0-\u04eb]|[\u04ee-\u04f5]|[\u04f8-\u04f9]|[\u0531-\u0556]|ՙ|[\u0561-\u0586]|[\u05d0-\u05ea]|[\u05f0-\u05f2]|[\u0621-\u063a]|[\u0641-\u064a]|[\u0671-\u06b7]|[\u06ba-\u06be]|[\u06c0-\u06ce]|[\u06d0-\u06d3]|ە|[\u06e5-\u06e6]|[\u0905-\u0939]|ऽ|[\u0958-\u0961]|[\u0985-\u098c]|[\u098f-\u0990]|[\u0993-\u09a8]|[\u09aa-\u09b0]|ল|[\u09b6-\u09b9]|[\u09dc-\u09dd]|[\u09df-\u09e1]|[\u09f0-\u09f1]|[\u0a05-\u0a0a]|[\u0a0f-\u0a10]|[\u0a13-\u0a28]|[\u0a2a-\u0a30]|[\u0a32-\u0a33]|[\u0a35-\u0a36]|[\u0a38-\u0a39]|[\u0a59-\u0a5c]|ਫ਼|[\u0a72-\u0a74]|[\u0a85-\u0a8b]|ઍ|[\u0a8f-\u0a91]|[\u0a93-\u0aa8]|[\u0aaa-\u0ab0]|[\u0ab2-\u0ab3]|[\u0ab5-\u0ab9]|ઽ|ૠ|[\u0b05-\u0b0c]|[\u0b0f-\u0b10]|[\u0b13-\u0b28]|[\u0b2a-\u0b30]|[\u0b32-\u0b33]|[\u0b36-\u0b39]|ଽ|[\u0b5c-\u0b5d]|[\u0b5f-\u0b61]|[\u0b85-\u0b8a]|[\u0b8e-\u0b90]|[\u0b92-\u0b95]|[\u0b99-\u0b9a]|ஜ|[\u0b9e-\u0b9f]|[\u0ba3-\u0ba4]|[\u0ba8-\u0baa]|[\u0bae-\u0bb5]|[\u0bb7-\u0bb9]|[\u0c05-\u0c0c]|[\u0c0e-\u0c10]|[\u0c12-\u0c28]|[\u0c2a-\u0c33]|[\u0c35-\u0c39]|[\u0c60-\u0c61]|[\u0c85-\u0c8c]|[\u0c8e-\u0c90]|[\u0c92-\u0ca8]|[\u0caa-\u0cb3]|[\u0cb5-\u0cb9]|ೞ|[\u0ce0-\u0ce1]|[\u0d05-\u0d0c]|[\u0d0e-\u0d10]|[\u0d12-\u0d28]|[\u0d2a-\u0d39]|[\u0d60-\u0d61]|[\u0e01-\u0e2e]|ะ|[\u0e32-\u0e33]|[\u0e40-\u0e45]|[\u0e81-\u0e82]|ຄ|[\u0e87-\u0e88]|ຊ|ຍ|[\u0e94-\u0e97]|[\u0e99-\u0e9f]|[\u0ea1-\u0ea3]|ລ|ວ|[\u0eaa-\u0eab]|[\u0ead-\u0eae]|ະ|[\u0eb2-\u0eb3]|ຽ|[\u0ec0-\u0ec4]|[\u0f40-\u0f47]|[\u0f49-\u0f69]|[\u10a0-\u10c5]|[\u10d0-\u10f6]|ᄀ|[\u1102-\u1103]|[\u1105-\u1107]|ᄉ|[\u110b-\u110c]|[\u110e-\u1112]|ᄼ|ᄾ|ᅀ|ᅌ|ᅎ|ᅐ|[\u1154-\u1155]|ᅙ|[\u115f-\u1161]|ᅣ|ᅥ|ᅧ|ᅩ|[\u116d-\u116e]|[\u1172-\u1173]|ᅵ|ᆞ|ᆨ|ᆫ|[\u11ae-\u11af]|[\u11b7-\u11b8]|ᆺ|[\u11bc-\u11c2]|ᇫ|ᇰ|ᇹ|[\u1e00-\u1e9b]|[\u1ea0-\u1ef9]|[\u1f00-\u1f15]|[\u1f18-\u1f1d]|[\u1f20-\u1f45]|[\u1f48-\u1f4d]|[\u1f50-\u1f57]|Ὑ|Ὓ|Ὕ|[\u1f5f-\u1f7d]|[\u1f80-\u1fb4]|[\u1fb6-\u1fbc]|ι|[\u1fc2-\u1fc4]|[\u1fc6-\u1fcc]|[\u1fd0-\u1fd3]|[\u1fd6-\u1fdb]|[\u1fe0-\u1fec]|[\u1ff2-\u1ff4]|[\u1ff6-\u1ffc]|Ω|[\u212a-\u212b]|℮|[\u2180-\u2182]|[\u3041-\u3094]|[\u30a1-\u30fa]|[\u3105-\u312c]|[\uac00-\ud7a3]|[\u4e00-\u9fa5]|〇|[\u3021-\u3029])|\$|_|\\u[0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F])(?:(?:(?:(?:[\u0041-\u005a]|[\u0061-\u007a]|[\u00c0-\u00d6]|[\u00d8-\u00f6]|[\u00f8-\u00ff]|[\u0100-\u0131]|[\u0134-\u013e]|[\u0141-\u0148]|[\u014a-\u017e]|[\u0180-\u01c3]|[\u01cd-\u01f0]|[\u01f4-\u01f5]|[\u01fa-\u0217]|[\u0250-\u02a8]|[\u02bb-\u02c1]|Ά|[\u0388-\u038a]|Ό|[\u038e-\u03a1]|[\u03a3-\u03ce]|[\u03d0-\u03d6]|Ϛ|Ϝ|Ϟ|Ϡ|[\u03e2-\u03f3]|[\u0401-\u040c]|[\u040e-\u044f]|[\u0451-\u045c]|[\u045e-\u0481]|[\u0490-\u04c4]|[\u04c7-\u04c8]|[\u04cb-\u04cc]|[\u04d0-\u04eb]|[\u04ee-\u04f5]|[\u04f8-\u04f9]|[\u0531-\u0556]|ՙ|[\u0561-\u0586]|[\u05d0-\u05ea]|[\u05f0-\u05f2]|[\u0621-\u063a]|[\u0641-\u064a]|[\u0671-\u06b7]|[\u06ba-\u06be]|[\u06c0-\u06ce]|[\u06d0-\u06d3]|ە|[\u06e5-\u06e6]|[\u0905-\u0939]|ऽ|[\u0958-\u0961]|[\u0985-\u098c]|[\u098f-\u0990]|[\u0993-\u09a8]|[\u09aa-\u09b0]|ল|[\u09b6-\u09b9]|[\u09dc-\u09dd]|[\u09df-\u09e1]|[\u09f0-\u09f1]|[\u0a05-\u0a0a]|[\u0a0f-\u0a10]|[\u0a13-\u0a28]|[\u0a2a-\u0a30]|[\u0a32-\u0a33]|[\u0a35-\u0a36]|[\u0a38-\u0a39]|[\u0a59-\u0a5c]|ਫ਼|[\u0a72-\u0a74]|[\u0a85-\u0a8b]|ઍ|[\u0a8f-\u0a91]|[\u0a93-\u0aa8]|[\u0aaa-\u0ab0]|[\u0ab2-\u0ab3]|[\u0ab5-\u0ab9]|ઽ|ૠ|[\u0b05-\u0b0c]|[\u0b0f-\u0b10]|[\u0b13-\u0b28]|[\u0b2a-\u0b30]|[\u0b32-\u0b33]|[\u0b36-\u0b39]|ଽ|[\u0b5c-\u0b5d]|[\u0b5f-\u0b61]|[\u0b85-\u0b8a]|[\u0b8e-\u0b90]|[\u0b92-\u0b95]|[\u0b99-\u0b9a]|ஜ|[\u0b9e-\u0b9f]|[\u0ba3-\u0ba4]|[\u0ba8-\u0baa]|[\u0bae-\u0bb5]|[\u0bb7-\u0bb9]|[\u0c05-\u0c0c]|[\u0c0e-\u0c10]|[\u0c12-\u0c28]|[\u0c2a-\u0c33]|[\u0c35-\u0c39]|[\u0c60-\u0c61]|[\u0c85-\u0c8c]|[\u0c8e-\u0c90]|[\u0c92-\u0ca8]|[\u0caa-\u0cb3]|[\u0cb5-\u0cb9]|ೞ|[\u0ce0-\u0ce1]|[\u0d05-\u0d0c]|[\u0d0e-\u0d10]|[\u0d12-\u0d28]|[\u0d2a-\u0d39]|[\u0d60-\u0d61]|[\u0e01-\u0e2e]|ะ|[\u0e32-\u0e33]|[\u0e40-\u0e45]|[\u0e81-\u0e82]|ຄ|[\u0e87-\u0e88]|ຊ|ຍ|[\u0e94-\u0e97]|[\u0e99-\u0e9f]|[\u0ea1-\u0ea3]|ລ|ວ|[\u0eaa-\u0eab]|[\u0ead-\u0eae]|ະ|[\u0eb2-\u0eb3]|ຽ|[\u0ec0-\u0ec4]|[\u0f40-\u0f47]|[\u0f49-\u0f69]|[\u10a0-\u10c5]|[\u10d0-\u10f6]|ᄀ|[\u1102-\u1103]|[\u1105-\u1107]|ᄉ|[\u110b-\u110c]|[\u110e-\u1112]|ᄼ|ᄾ|ᅀ|ᅌ|ᅎ|ᅐ|[\u1154-\u1155]|ᅙ|[\u115f-\u1161]|ᅣ|ᅥ|ᅧ|ᅩ|[\u116d-\u116e]|[\u1172-\u1173]|ᅵ|ᆞ|ᆨ|ᆫ|[\u11ae-\u11af]|[\u11b7-\u11b8]|ᆺ|[\u11bc-\u11c2]|ᇫ|ᇰ|ᇹ|[\u1e00-\u1e9b]|[\u1ea0-\u1ef9]|[\u1f00-\u1f15]|[\u1f18-\u1f1d]|[\u1f20-\u1f45]|[\u1f48-\u1f4d]|[\u1f50-\u1f57]|Ὑ|Ὓ|Ὕ|[\u1f5f-\u1f7d]|[\u1f80-\u1fb4]|[\u1fb6-\u1fbc]|ι|[\u1fc2-\u1fc4]|[\u1fc6-\u1fcc]|[\u1fd0-\u1fd3]|[\u1fd6-\u1fdb]|[\u1fe0-\u1fec]|[\u1ff2-\u1ff4]|[\u1ff6-\u1ffc]|Ω|[\u212a-\u212b]|℮|[\u2180-\u2182]|[\u3041-\u3094]|[\u30a1-\u30fa]|[\u3105-\u312c]|[\uac00-\ud7a3]|[\u4e00-\u9fa5]|〇|[\u3021-\u3029])|\$|_|\\u[0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F])|(?:[\u0300-\u0345]|[\u0360-\u0361]|[\u0483-\u0486]|[\u0591-\u05a1]|[\u05a3-\u05b9]|[\u05bb-\u05bd]|ֿ|[\u05c1-\u05c2]|ׄ|[\u064b-\u0652]|ٰ|[\u06d6-\u06dc]|[\u06dd-\u06df]|[\u06e0-\u06e4]|[\u06e7-\u06e8]|[\u06ea-\u06ed]|[\u0901-\u0903]|़|[\u093e-\u094c]|्|[\u0951-\u0954]|[\u0962-\u0963]|[\u0981-\u0983]|়|া|ি|[\u09c0-\u09c4]|[\u09c7-\u09c8]|[\u09cb-\u09cd]|ৗ|[\u09e2-\u09e3]|ਂ|਼|ਾ|ਿ|[\u0a40-\u0a42]|[\u0a47-\u0a48]|[\u0a4b-\u0a4d]|[\u0a70-\u0a71]|[\u0a81-\u0a83]|઼|[\u0abe-\u0ac5]|[\u0ac7-\u0ac9]|[\u0acb-\u0acd]|[\u0b01-\u0b03]|଼|[\u0b3e-\u0b43]|[\u0b47-\u0b48]|[\u0b4b-\u0b4d]|[\u0b56-\u0b57]|[\u0b82-\u0b83]|[\u0bbe-\u0bc2]|[\u0bc6-\u0bc8]|[\u0bca-\u0bcd]|ௗ|[\u0c01-\u0c03]|[\u0c3e-\u0c44]|[\u0c46-\u0c48]|[\u0c4a-\u0c4d]|[\u0c55-\u0c56]|[\u0c82-\u0c83]|[\u0cbe-\u0cc4]|[\u0cc6-\u0cc8]|[\u0cca-\u0ccd]|[\u0cd5-\u0cd6]|[\u0d02-\u0d03]|[\u0d3e-\u0d43]|[\u0d46-\u0d48]|[\u0d4a-\u0d4d]|ൗ|ั|[\u0e34-\u0e3a]|[\u0e47-\u0e4e]|ັ|[\u0eb4-\u0eb9]|[\u0ebb-\u0ebc]|[\u0ec8-\u0ecd]|[\u0f18-\u0f19]|༵|༷|༹|༾|༿|[\u0f71-\u0f84]|[\u0f86-\u0f8b]|[\u0f90-\u0f95]|ྗ|[\u0f99-\u0fad]|[\u0fb1-\u0fb7]|ྐྵ|[\u20d0-\u20dc]|⃡|[\u302a-\u302f]|゙|゚)|(?:[\u0030-\u0039]|[\u0660-\u0669]|[\u06f0-\u06f9]|[\u0966-\u096f]|[\u09e6-\u09ef]|[\u0a66-\u0a6f]|[\u0ae6-\u0aef]|[\u0b66-\u0b6f]|[\u0be7-\u0bef]|[\u0c66-\u0c6f]|[\u0ce6-\u0cef]|[\u0d66-\u0d6f]|[\u0e50-\u0e59]|[\u0ed0-\u0ed9]|[\u0f20-\u0f29])|(?:·|ː|ˑ|·|ـ|ๆ|ໆ|々|[\u3031-\u3035]|[\u309d-\u309e]|[\u30fc-\u30fe])|‌|‍))*/ },    { type: 'StringLiteral', regex: /^(?:"(?:(?:[\s\S]|\\(?:(?:['"\\bfnrtv]|[\s\S])|(?:[0-7]|[0-3][0-7]|[4-7][0-7]|[0-3][0-7][0-7])|x[0-9a-fA-F][0-9a-fA-F]|u[0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F])|\\(?:\u000d\u000a|\u000a|\u000d|\u2028|\u2029)))*"|'(?:(?:[\s\S]|\\(?:(?:['"\\bfnrtv]|[\s\S])|(?:[0-7]|[0-3][0-7]|[4-7][0-7]|[0-3][0-7][0-7])|x[0-9a-fA-F][0-9a-fA-F]|u[0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F])|\\(?:\u000d\u000a|\u000a|\u000d|\u2028|\u2029)))*')/ },    { type: 'RegularExpressionLiteral', regex: /^\/(?:[\s\S]|\\[\s\S]|\[(?:(?:[\s\S]|\\[\s\S]))*\])(?:(?:[\s\S]|\\[\s\S]|\[(?:(?:[\s\S]|\\[\s\S]))*\]))*\/(?:(?:(?:(?:[\u0041-\u005a]|[\u0061-\u007a]|[\u00c0-\u00d6]|[\u00d8-\u00f6]|[\u00f8-\u00ff]|[\u0100-\u0131]|[\u0134-\u013e]|[\u0141-\u0148]|[\u014a-\u017e]|[\u0180-\u01c3]|[\u01cd-\u01f0]|[\u01f4-\u01f5]|[\u01fa-\u0217]|[\u0250-\u02a8]|[\u02bb-\u02c1]|Ά|[\u0388-\u038a]|Ό|[\u038e-\u03a1]|[\u03a3-\u03ce]|[\u03d0-\u03d6]|Ϛ|Ϝ|Ϟ|Ϡ|[\u03e2-\u03f3]|[\u0401-\u040c]|[\u040e-\u044f]|[\u0451-\u045c]|[\u045e-\u0481]|[\u0490-\u04c4]|[\u04c7-\u04c8]|[\u04cb-\u04cc]|[\u04d0-\u04eb]|[\u04ee-\u04f5]|[\u04f8-\u04f9]|[\u0531-\u0556]|ՙ|[\u0561-\u0586]|[\u05d0-\u05ea]|[\u05f0-\u05f2]|[\u0621-\u063a]|[\u0641-\u064a]|[\u0671-\u06b7]|[\u06ba-\u06be]|[\u06c0-\u06ce]|[\u06d0-\u06d3]|ە|[\u06e5-\u06e6]|[\u0905-\u0939]|ऽ|[\u0958-\u0961]|[\u0985-\u098c]|[\u098f-\u0990]|[\u0993-\u09a8]|[\u09aa-\u09b0]|ল|[\u09b6-\u09b9]|[\u09dc-\u09dd]|[\u09df-\u09e1]|[\u09f0-\u09f1]|[\u0a05-\u0a0a]|[\u0a0f-\u0a10]|[\u0a13-\u0a28]|[\u0a2a-\u0a30]|[\u0a32-\u0a33]|[\u0a35-\u0a36]|[\u0a38-\u0a39]|[\u0a59-\u0a5c]|ਫ਼|[\u0a72-\u0a74]|[\u0a85-\u0a8b]|ઍ|[\u0a8f-\u0a91]|[\u0a93-\u0aa8]|[\u0aaa-\u0ab0]|[\u0ab2-\u0ab3]|[\u0ab5-\u0ab9]|ઽ|ૠ|[\u0b05-\u0b0c]|[\u0b0f-\u0b10]|[\u0b13-\u0b28]|[\u0b2a-\u0b30]|[\u0b32-\u0b33]|[\u0b36-\u0b39]|ଽ|[\u0b5c-\u0b5d]|[\u0b5f-\u0b61]|[\u0b85-\u0b8a]|[\u0b8e-\u0b90]|[\u0b92-\u0b95]|[\u0b99-\u0b9a]|ஜ|[\u0b9e-\u0b9f]|[\u0ba3-\u0ba4]|[\u0ba8-\u0baa]|[\u0bae-\u0bb5]|[\u0bb7-\u0bb9]|[\u0c05-\u0c0c]|[\u0c0e-\u0c10]|[\u0c12-\u0c28]|[\u0c2a-\u0c33]|[\u0c35-\u0c39]|[\u0c60-\u0c61]|[\u0c85-\u0c8c]|[\u0c8e-\u0c90]|[\u0c92-\u0ca8]|[\u0caa-\u0cb3]|[\u0cb5-\u0cb9]|ೞ|[\u0ce0-\u0ce1]|[\u0d05-\u0d0c]|[\u0d0e-\u0d10]|[\u0d12-\u0d28]|[\u0d2a-\u0d39]|[\u0d60-\u0d61]|[\u0e01-\u0e2e]|ะ|[\u0e32-\u0e33]|[\u0e40-\u0e45]|[\u0e81-\u0e82]|ຄ|[\u0e87-\u0e88]|ຊ|ຍ|[\u0e94-\u0e97]|[\u0e99-\u0e9f]|[\u0ea1-\u0ea3]|ລ|ວ|[\u0eaa-\u0eab]|[\u0ead-\u0eae]|ະ|[\u0eb2-\u0eb3]|ຽ|[\u0ec0-\u0ec4]|[\u0f40-\u0f47]|[\u0f49-\u0f69]|[\u10a0-\u10c5]|[\u10d0-\u10f6]|ᄀ|[\u1102-\u1103]|[\u1105-\u1107]|ᄉ|[\u110b-\u110c]|[\u110e-\u1112]|ᄼ|ᄾ|ᅀ|ᅌ|ᅎ|ᅐ|[\u1154-\u1155]|ᅙ|[\u115f-\u1161]|ᅣ|ᅥ|ᅧ|ᅩ|[\u116d-\u116e]|[\u1172-\u1173]|ᅵ|ᆞ|ᆨ|ᆫ|[\u11ae-\u11af]|[\u11b7-\u11b8]|ᆺ|[\u11bc-\u11c2]|ᇫ|ᇰ|ᇹ|[\u1e00-\u1e9b]|[\u1ea0-\u1ef9]|[\u1f00-\u1f15]|[\u1f18-\u1f1d]|[\u1f20-\u1f45]|[\u1f48-\u1f4d]|[\u1f50-\u1f57]|Ὑ|Ὓ|Ὕ|[\u1f5f-\u1f7d]|[\u1f80-\u1fb4]|[\u1fb6-\u1fbc]|ι|[\u1fc2-\u1fc4]|[\u1fc6-\u1fcc]|[\u1fd0-\u1fd3]|[\u1fd6-\u1fdb]|[\u1fe0-\u1fec]|[\u1ff2-\u1ff4]|[\u1ff6-\u1ffc]|Ω|[\u212a-\u212b]|℮|[\u2180-\u2182]|[\u3041-\u3094]|[\u30a1-\u30fa]|[\u3105-\u312c]|[\uac00-\ud7a3]|[\u4e00-\u9fa5]|〇|[\u3021-\u3029])|\$|_|\\u[0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F])|(?:[\u0300-\u0345]|[\u0360-\u0361]|[\u0483-\u0486]|[\u0591-\u05a1]|[\u05a3-\u05b9]|[\u05bb-\u05bd]|ֿ|[\u05c1-\u05c2]|ׄ|[\u064b-\u0652]|ٰ|[\u06d6-\u06dc]|[\u06dd-\u06df]|[\u06e0-\u06e4]|[\u06e7-\u06e8]|[\u06ea-\u06ed]|[\u0901-\u0903]|़|[\u093e-\u094c]|्|[\u0951-\u0954]|[\u0962-\u0963]|[\u0981-\u0983]|়|া|ি|[\u09c0-\u09c4]|[\u09c7-\u09c8]|[\u09cb-\u09cd]|ৗ|[\u09e2-\u09e3]|ਂ|਼|ਾ|ਿ|[\u0a40-\u0a42]|[\u0a47-\u0a48]|[\u0a4b-\u0a4d]|[\u0a70-\u0a71]|[\u0a81-\u0a83]|઼|[\u0abe-\u0ac5]|[\u0ac7-\u0ac9]|[\u0acb-\u0acd]|[\u0b01-\u0b03]|଼|[\u0b3e-\u0b43]|[\u0b47-\u0b48]|[\u0b4b-\u0b4d]|[\u0b56-\u0b57]|[\u0b82-\u0b83]|[\u0bbe-\u0bc2]|[\u0bc6-\u0bc8]|[\u0bca-\u0bcd]|ௗ|[\u0c01-\u0c03]|[\u0c3e-\u0c44]|[\u0c46-\u0c48]|[\u0c4a-\u0c4d]|[\u0c55-\u0c56]|[\u0c82-\u0c83]|[\u0cbe-\u0cc4]|[\u0cc6-\u0cc8]|[\u0cca-\u0ccd]|[\u0cd5-\u0cd6]|[\u0d02-\u0d03]|[\u0d3e-\u0d43]|[\u0d46-\u0d48]|[\u0d4a-\u0d4d]|ൗ|ั|[\u0e34-\u0e3a]|[\u0e47-\u0e4e]|ັ|[\u0eb4-\u0eb9]|[\u0ebb-\u0ebc]|[\u0ec8-\u0ecd]|[\u0f18-\u0f19]|༵|༷|༹|༾|༿|[\u0f71-\u0f84]|[\u0f86-\u0f8b]|[\u0f90-\u0f95]|ྗ|[\u0f99-\u0fad]|[\u0fb1-\u0fb7]|ྐྵ|[\u20d0-\u20dc]|⃡|[\u302a-\u302f]|゙|゚)|(?:[\u0030-\u0039]|[\u0660-\u0669]|[\u06f0-\u06f9]|[\u0966-\u096f]|[\u09e6-\u09ef]|[\u0a66-\u0a6f]|[\u0ae6-\u0aef]|[\u0b66-\u0b6f]|[\u0be7-\u0bef]|[\u0c66-\u0c6f]|[\u0ce6-\u0cef]|[\u0d66-\u0d6f]|[\u0e50-\u0e59]|[\u0ed0-\u0ed9]|[\u0f20-\u0f29])|(?:·|ː|ˑ|·|ـ|ๆ|ໆ|々|[\u3031-\u3035]|[\u309d-\u309e]|[\u30fc-\u30fe])|‌|‍))*/ },    { type: 'NoSubstitutionTemplate', regex: /^`(?:(?:\$(?:[^{])|\\\\(?:(?:['"\\bfnrtv]|[\s\S])|(?:[0-7]|[0-3][0-7]|[4-7][0-7]|[0-3][0-7][0-7])|x[0-9a-fA-F][0-9a-fA-F]|u[0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F])|\\(?:\u000d\u000a|\u000a|\u000d|\u2028|\u2029)|(?:\u000d\u000a|\u000a|\u000d|\u2028|\u2029)|(?:[\s\S])))*`/ },    { type: 'TemplateHead', regex: /^`(?:(?:\$(?:[^{])|\\\\(?:(?:['"\\bfnrtv]|[\s\S])|(?:[0-7]|[0-3][0-7]|[4-7][0-7]|[0-3][0-7][0-7])|x[0-9a-fA-F][0-9a-fA-F]|u[0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F])|\\(?:\u000d\u000a|\u000a|\u000d|\u2028|\u2029)|(?:\u000d\u000a|\u000a|\u000d|\u2028|\u2029)|(?:[\s\S])))*\$\{/ },    { type: 'TemplateMiddle', regex: /^\}(?:(?:\$(?:[^{])|\\\\(?:(?:['"\\bfnrtv]|[\s\S])|(?:[0-7]|[0-3][0-7]|[4-7][0-7]|[0-3][0-7][0-7])|x[0-9a-fA-F][0-9a-fA-F]|u[0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F])|\\(?:\u000d\u000a|\u000a|\u000d|\u2028|\u2029)|(?:\u000d\u000a|\u000a|\u000d|\u2028|\u2029)|(?:[\s\S])))*\$\{/ },    { type: 'TemplateTail', regex: /^\}(?:(?:\$(?:[^{])|\\\\(?:(?:['"\\bfnrtv]|[\s\S])|(?:[0-7]|[0-3][0-7]|[4-7][0-7]|[0-3][0-7][0-7])|x[0-9a-fA-F][0-9a-fA-F]|u[0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F])|\\(?:\u000d\u000a|\u000a|\u000d|\u2028|\u2029)|(?:\u000d\u000a|\u000a|\u000d|\u2028|\u2029)|(?:[\s\S])))*`/ },    { type: 'DecimalLiteral', regex: /^(?:(?:0|[1-9](?:[0-9])*)\.(?:[0-9])*(?:[eE](?:[+-])?(?:[0-9])+)?|\.(?:[0-9])+(?:[eE](?:[+-])?(?:[0-9])+)?|(?:0|[1-9](?:[0-9])*)(?:[eE](?:[+-])?(?:[0-9])+)?)/ },    { type: 'HexIntegerLiteral', regex: /^0[xX](?:[0-9a-fA-F])+/ },    { type: 'BinaryIntegerLiteral', regex: /^0[bB](?:[0-1])+/ },    { type: 'OctalIntegerLiteral', regex: /^0[oO](?:[0-7])+/ },    { type: 'skip', regex: /^(?:(?:\u0009|\u000b|\u000c| | |﻿|(?:[\u0009-\u000d]| || | |᠎|[\u2000-\u200a]|\u2028|\u2029| | |　)))+/, skip: true },    { type: 'skip', regex: /^(?:\/\*(?:(?:(?:[\s\S])|(?:\*(?:[\s\S]))))*\*\/|\/\/(?:(?:[\s\S]))*)/, skip: true },    ];
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
        const regex = pattern.regex;
        const match = this.input.substring(this.position).match(regex);

        if (match && match.index === 0 && match[0].length > 0) {
          candidates.push({ pattern, match });
          if (!bestMatch
              || match[0].length > bestMatch[0].length
              || (match[0].length === bestMatch[0].length && pattern.skip && !bestPattern.skip)
              || (match[0].length === bestMatch[0].length
                  && bestPattern
                  && isGenericNameType(bestPattern.type)
                  && !isGenericNameType(pattern.type))) {
            bestPattern = pattern;
            bestMatch = match;
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

class Parser {
  constructor(input, eventHandler = null) {
    this.lexer = new Lexer(input);
    this.tokens = this.lexer.tokenize();
    this.position = 0;
    this.errors = [];
    this.eventHandler = eventHandler;
  }
  
  peek() {
    return this.tokens[this.position];
  }
  
  consume(expectedType) {
    const token = this.peek();
    if (!token || token.type !== expectedType) {
      this.errors.push({
        expected: expectedType,
        found: token ? token.type : 'EOF',
        position: this.position
      });
      throw new Error(`Expected '${expectedType}', got '${token ? token.type : 'EOF'}'`);
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
      this.position++;
      return true;
    }
    return false;
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
    const result = this.parseprogram();
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
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('program', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('program', this.position);
        }
      }
    }
  }
  parsesourceElement() {
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
      throw new Error(`Expected one of: 3 alternatives`);
    }

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('sourceElement', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('sourceElement', this.position);
        }
      }
    }
  }
  parsestatement() {
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
      throw new Error(`Expected one of: 21 alternatives`);
    }

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('statement', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('statement', this.position);
        }
      }
    }
  }
  parseblock() {
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
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('block', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('block', this.position);
        }
      }
    }
  }
  parsevariableStatement() {
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
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('variableStatement', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('variableStatement', this.position);
        }
      }
    }
  }
  parseletDeclaration() {
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
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('letDeclaration', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('letDeclaration', this.position);
        }
      }
    }
  }
  parseconstDeclaration() {
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
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('constDeclaration', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('constDeclaration', this.position);
        }
      }
    }
  }
  parselexicalDeclaration() {
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
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('lexicalDeclaration', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('lexicalDeclaration', this.position);
        }
      }
    }
  }
  parseletOrConst() {
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
      throw new Error(`Expected one of: 2 alternatives`);
    }

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('letOrConst', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('letOrConst', this.position);
        }
      }
    }
  }
  parsebindingList() {
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
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('bindingList', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('bindingList', this.position);
        }
      }
    }
  }
  parselexicalBinding() {
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
      throw new Error(`Expected one of: 2 alternatives`);
    }

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('lexicalBinding', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('lexicalBinding', this.position);
        }
      }
    }
  }
  parsevariableDeclarationList() {
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
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('variableDeclarationList', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('variableDeclarationList', this.position);
        }
      }
    }
  }
  parsevariableDeclaration() {
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
      throw new Error(`Expected one of: 2 alternatives`);
    }

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('variableDeclaration', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('variableDeclaration', this.position);
        }
      }
    }
  }
  parseinitializer() {
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('initializer', this.position);
    }
    let __ok = false;
    try {
    this.consume('TOKEN__3D_');
    this.parseassignmentExpression();

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('initializer', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('initializer', this.position);
        }
      }
    }
  }
  parseassignmentExpression() {
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
      throw new Error(`Expected one of: 5 alternatives`);
    }

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('assignmentExpression', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('assignmentExpression', this.position);
        }
      }
    }
  }
  parseyieldExpression() {
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
      throw new Error(`Expected one of: 2 alternatives`);
    }

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('yieldExpression', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('yieldExpression', this.position);
        }
      }
    }
  }
  parsearrowFunction() {
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
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('arrowFunction', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('arrowFunction', this.position);
        }
      }
    }
  }
  parseasyncArrowFunction() {
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
      throw new Error(`Expected one of: 3 alternatives`);
    }

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('asyncArrowFunction', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('asyncArrowFunction', this.position);
        }
      }
    }
  }
  parseasyncArrowBindingIdentifier() {
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('asyncArrowBindingIdentifier', this.position);
    }
    let __ok = false;
    try {
    this.parsebindingIdentifier();

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('asyncArrowBindingIdentifier', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('asyncArrowBindingIdentifier', this.position);
        }
      }
    }
  }
  parsecoverCallExpressionAndAsyncArrowHead() {
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('coverCallExpressionAndAsyncArrowHead', this.position);
    }
    let __ok = false;
    try {
    this.parsememberExpression();
    this.parsearguments();

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('coverCallExpressionAndAsyncArrowHead', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('coverCallExpressionAndAsyncArrowHead', this.position);
        }
      }
    }
  }
  parseasyncConciseBody() {
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
      throw new Error(`Expected one of: 2 alternatives`);
    }

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('asyncConciseBody', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('asyncConciseBody', this.position);
        }
      }
    }
  }
  parsearrowFunctionParameters() {
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
      throw new Error(`Expected one of: 2 alternatives`);
    }

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('arrowFunctionParameters', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('arrowFunctionParameters', this.position);
        }
      }
    }
  }
  parsearrowFunctionBody() {
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
      throw new Error(`Expected one of: 2 alternatives`);
    }

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('arrowFunctionBody', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('arrowFunctionBody', this.position);
        }
      }
    }
  }
  parseconditionalExpression() {
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
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('conditionalExpression', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('conditionalExpression', this.position);
        }
      }
    }
  }
  parselogicalORExpression() {
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
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('logicalORExpression', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('logicalORExpression', this.position);
        }
      }
    }
  }
  parselogicalANDExpression() {
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
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('logicalANDExpression', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('logicalANDExpression', this.position);
        }
      }
    }
  }
  parsebitwiseORExpression() {
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
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('bitwiseORExpression', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('bitwiseORExpression', this.position);
        }
      }
    }
  }
  parsebitwiseXORExpression() {
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
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('bitwiseXORExpression', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('bitwiseXORExpression', this.position);
        }
      }
    }
  }
  parsebitwiseANDExpression() {
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
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('bitwiseANDExpression', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('bitwiseANDExpression', this.position);
        }
      }
    }
  }
  parseequalityExpression() {
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
      if (!_matchedAlt) { throw new Error('No group alternative matched'); }
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
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('equalityExpression', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('equalityExpression', this.position);
        }
      }
    }
  }
  parserelationalExpression() {
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
      if (!_matchedAlt) { throw new Error('No group alternative matched'); }
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
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('relationalExpression', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('relationalExpression', this.position);
        }
      }
    }
  }
  parseshiftExpression() {
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
      if (!_matchedAlt) { throw new Error('No group alternative matched'); }
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
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('shiftExpression', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('shiftExpression', this.position);
        }
      }
    }
  }
  parseadditiveExpression() {
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
      if (!_matchedAlt) { throw new Error('No group alternative matched'); }
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
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('additiveExpression', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('additiveExpression', this.position);
        }
      }
    }
  }
  parsemultiplicativeExpression() {
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
      if (!_matchedAlt) { throw new Error('No group alternative matched'); }
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
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('multiplicativeExpression', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('multiplicativeExpression', this.position);
        }
      }
    }
  }
  parseexponentiationExpression() {
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
      throw new Error(`Expected one of: 2 alternatives`);
    }

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('exponentiationExpression', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('exponentiationExpression', this.position);
        }
      }
    }
  }
  parseunaryExpression() {
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
      throw new Error(`Expected one of: 11 alternatives`);
    }

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('unaryExpression', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('unaryExpression', this.position);
        }
      }
    }
  }
  parseawaitExpression() {
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('awaitExpression', this.position);
    }
    let __ok = false;
    try {
    this.consume('TOKEN_await');
    this.parseunaryExpression();

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('awaitExpression', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('awaitExpression', this.position);
        }
      }
    }
  }
  parsepostfixExpression() {
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
      if (!_matchedAlt) { throw new Error('No group alternative matched'); }
      } catch (e) {
        this.position = _optStart;
        this.restoreEventState(_optMark);
      }
    }

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('postfixExpression', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('postfixExpression', this.position);
        }
      }
    }
  }
  parseleftHandSideExpression() {
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
      throw new Error(`Expected one of: 2 alternatives`);
    }

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('leftHandSideExpression', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('leftHandSideExpression', this.position);
        }
      }
    }
  }
  parsenewExpression() {
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
      throw new Error(`Expected one of: 2 alternatives`);
    }

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('newExpression', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('newExpression', this.position);
        }
      }
    }
  }
  parsememberExpression() {
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
      if (!_matchedAlt) { throw new Error('No group alternative matched'); }
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
      if (!_matchedAlt) { throw new Error('No group alternative matched'); }
      } catch (e) {
        this.position = _loopStart;
        this.restoreEventState(_loopMark);
        break;
      }
      if (this.position === _loopStart) break;
    }

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('memberExpression', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('memberExpression', this.position);
        }
      }
    }
  }
  parseprimaryExpression() {
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
      throw new Error(`Expected one of: 7 alternatives`);
    }

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('primaryExpression', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('primaryExpression', this.position);
        }
      }
    }
  }
  parseliteral() {
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
      throw new Error(`Expected one of: 5 alternatives`);
    }

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('literal', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('literal', this.position);
        }
      }
    }
  }
  parsenumericLiteral() {
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
      throw new Error(`Expected one of: 4 alternatives`);
    }

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('numericLiteral', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('numericLiteral', this.position);
        }
      }
    }
  }
  parsestringLiteral() {
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('stringLiteral', this.position);
    }
    let __ok = false;
    try {
    this.consume('StringLiteral');

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('stringLiteral', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('stringLiteral', this.position);
        }
      }
    }
  }
  parseregularExpressionLiteral() {
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('regularExpressionLiteral', this.position);
    }
    let __ok = false;
    try {
    this.consume('RegularExpressionLiteral');

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('regularExpressionLiteral', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('regularExpressionLiteral', this.position);
        }
      }
    }
  }
  parsearrayLiteral() {
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('arrayLiteral', this.position);
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
    this.parseelementList();
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
    this.parseelementList();
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
    this.consume('TOKEN__5D_');
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      throw new Error(`Expected one of: 3 alternatives`);
    }

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('arrayLiteral', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('arrayLiteral', this.position);
        }
      }
    }
  }
  parseelementList() {
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('elementList', this.position);
    }
    let __ok = false;
    try {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
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
    this.parsespreadElement();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parseelementList();
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
    this.parseelementList();
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
    this.parsespreadElement();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      throw new Error(`Expected one of: 4 alternatives`);
    }

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('elementList', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('elementList', this.position);
        }
      }
    }
  }
  parseelision() {
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('elision', this.position);
    }
    let __ok = false;
    try {
    do { /* one or more matched */ } while (this.match('TOKEN__2C_'));

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('elision', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('elision', this.position);
        }
      }
    }
  }
  parsespreadElement() {
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('spreadElement', this.position);
    }
    let __ok = false;
    try {
    this.consume('TOKEN__2E__2E__2E_');
    this.parseassignmentExpression();

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('spreadElement', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('spreadElement', this.position);
        }
      }
    }
  }
  parseobjectLiteral() {
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
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('objectLiteral', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('objectLiteral', this.position);
        }
      }
    }
  }
  parsepropertyAssignment() {
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
      throw new Error(`Expected one of: 6 alternatives`);
    }

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('propertyAssignment', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('propertyAssignment', this.position);
        }
      }
    }
  }
  parsepropertyName() {
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
      throw new Error(`Expected one of: 2 alternatives`);
    }

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('propertyName', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('propertyName', this.position);
        }
      }
    }
  }
  parseliteralPropertyName() {
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
      throw new Error(`Expected one of: 3 alternatives`);
    }

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('literalPropertyName', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('literalPropertyName', this.position);
        }
      }
    }
  }
  parsecomputedPropertyName() {
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
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('computedPropertyName', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('computedPropertyName', this.position);
        }
      }
    }
  }
  parseidentifierReference() {
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('identifierReference', this.position);
    }
    let __ok = false;
    try {
    this.parseidentifier();

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('identifierReference', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('identifierReference', this.position);
        }
      }
    }
  }
  parsecoverInitializedName() {
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('coverInitializedName', this.position);
    }
    let __ok = false;
    try {
    this.parseidentifierReference();
    this.parseinitializer();

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('coverInitializedName', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('coverInitializedName', this.position);
        }
      }
    }
  }
  parsebindingIdentifier() {
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('bindingIdentifier', this.position);
    }
    let __ok = false;
    try {
    this.parseidentifier();

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('bindingIdentifier', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('bindingIdentifier', this.position);
        }
      }
    }
  }
  parsebindingPattern() {
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
      throw new Error(`Expected one of: 2 alternatives`);
    }

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('bindingPattern', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('bindingPattern', this.position);
        }
      }
    }
  }
  parseobjectBindingPattern() {
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
      throw new Error(`Expected one of: 3 alternatives`);
    }

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('objectBindingPattern', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('objectBindingPattern', this.position);
        }
      }
    }
  }
  parsearrayBindingPattern() {
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
      throw new Error(`Expected one of: 3 alternatives`);
    }

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('arrayBindingPattern', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('arrayBindingPattern', this.position);
        }
      }
    }
  }
  parsebindingPropertyList() {
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
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('bindingPropertyList', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('bindingPropertyList', this.position);
        }
      }
    }
  }
  parsebindingElementList() {
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
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('bindingElementList', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('bindingElementList', this.position);
        }
      }
    }
  }
  parsebindingElisionElement() {
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
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('bindingElisionElement', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('bindingElisionElement', this.position);
        }
      }
    }
  }
  parsebindingProperty() {
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
      throw new Error(`Expected one of: 2 alternatives`);
    }

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('bindingProperty', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('bindingProperty', this.position);
        }
      }
    }
  }
  parsebindingElement() {
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
      throw new Error(`Expected one of: 2 alternatives`);
    }

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('bindingElement', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('bindingElement', this.position);
        }
      }
    }
  }
  parsesingleNameBinding() {
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
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('singleNameBinding', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('singleNameBinding', this.position);
        }
      }
    }
  }
  parsebindingRestElement() {
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('bindingRestElement', this.position);
    }
    let __ok = false;
    try {
    this.consume('TOKEN__2E__2E__2E_');
    this.parsebindingIdentifier();

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('bindingRestElement', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('bindingRestElement', this.position);
        }
      }
    }
  }
  parsefunctionBody() {
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
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('functionBody', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('functionBody', this.position);
        }
      }
    }
  }
  parsepropertySetParameterList() {
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('propertySetParameterList', this.position);
    }
    let __ok = false;
    try {
    this.parseformalParameter();

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('propertySetParameterList', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('propertySetParameterList', this.position);
        }
      }
    }
  }
  parseexpression() {
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
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('expression', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('expression', this.position);
        }
      }
    }
  }
  parsefunctionExpression() {
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
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('functionExpression', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('functionExpression', this.position);
        }
      }
    }
  }
  parseasyncFunctionExpression() {
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
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('asyncFunctionExpression', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('asyncFunctionExpression', this.position);
        }
      }
    }
  }
  parseclassExpression() {
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
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('classExpression', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('classExpression', this.position);
        }
      }
    }
  }
  parseformalParameterList() {
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
      throw new Error(`Expected one of: 3 alternatives`);
    }

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('formalParameterList', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('formalParameterList', this.position);
        }
      }
    }
  }
  parseformalsList() {
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
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('formalsList', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('formalsList', this.position);
        }
      }
    }
  }
  parseformalParameter() {
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('formalParameter', this.position);
    }
    let __ok = false;
    try {
    this.parsebindingElement();

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('formalParameter', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('formalParameter', this.position);
        }
      }
    }
  }
  parsefunctionRestParameter() {
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('functionRestParameter', this.position);
    }
    let __ok = false;
    try {
    this.parsebindingRestElement();

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('functionRestParameter', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('functionRestParameter', this.position);
        }
      }
    }
  }
  parsearguments() {
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
      throw new Error(`Expected one of: 3 alternatives`);
    }

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('arguments', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('arguments', this.position);
        }
      }
    }
  }
  parseargumentList() {
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('argumentList', this.position);
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
      const _ruleMark = this.markEventState();
      try {
    this.parseargumentList();
    this.consume('TOKEN__2C_');
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
    this.parseargumentList();
    this.consume('TOKEN__2C_');
    this.consume('TOKEN__2E__2E__2E_');
    this.parseassignmentExpression();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      throw new Error(`Expected one of: 4 alternatives`);
    }

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('argumentList', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('argumentList', this.position);
        }
      }
    }
  }
  parsecallExpression() {
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
      if (!_matchedAlt) { throw new Error('No group alternative matched'); }
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
      throw new Error(`Expected one of: 2 alternatives`);
    }

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('callExpression', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('callExpression', this.position);
        }
      }
    }
  }
  parseemptyStatement() {
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('emptyStatement', this.position);
    }
    let __ok = false;
    try {
    this.consume('TOKEN__3B_');

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('emptyStatement', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('emptyStatement', this.position);
        }
      }
    }
  }
  parseassignmentOperator() {
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
      throw new Error(`Expected one of: 13 alternatives`);
    }

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('assignmentOperator', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('assignmentOperator', this.position);
        }
      }
    }
  }
  parseexpressionStatement() {
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('expressionStatement', this.position);
    }
    let __ok = false;
    try {
    this.parseexpression();
    this.parsesemicolon();

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('expressionStatement', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('expressionStatement', this.position);
        }
      }
    }
  }
  parseifStatement() {
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
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('ifStatement', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('ifStatement', this.position);
        }
      }
    }
  }
  parseiterationStatement() {
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
      throw new Error(`Expected one of: 10 alternatives`);
    }

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('iterationStatement', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('iterationStatement', this.position);
        }
      }
    }
  }
  parseexpressionNoIn() {
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
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('expressionNoIn', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('expressionNoIn', this.position);
        }
      }
    }
  }
  parseassignmentExpressionNoIn() {
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
      throw new Error(`Expected one of: 2 alternatives`);
    }

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('assignmentExpressionNoIn', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('assignmentExpressionNoIn', this.position);
        }
      }
    }
  }
  parseconditionalExpressionNoIn() {
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
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('conditionalExpressionNoIn', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('conditionalExpressionNoIn', this.position);
        }
      }
    }
  }
  parselogicalORExpressionNoIn() {
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
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('logicalORExpressionNoIn', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('logicalORExpressionNoIn', this.position);
        }
      }
    }
  }
  parselogicalANDExpressionNoIn() {
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
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('logicalANDExpressionNoIn', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('logicalANDExpressionNoIn', this.position);
        }
      }
    }
  }
  parsebitwiseORExpressionNoIn() {
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
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('bitwiseORExpressionNoIn', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('bitwiseORExpressionNoIn', this.position);
        }
      }
    }
  }
  parsebitwiseXORExpressionNoIn() {
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
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('bitwiseXORExpressionNoIn', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('bitwiseXORExpressionNoIn', this.position);
        }
      }
    }
  }
  parsebitwiseANDExpressionNoIn() {
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
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('bitwiseANDExpressionNoIn', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('bitwiseANDExpressionNoIn', this.position);
        }
      }
    }
  }
  parseequalityExpressionNoIn() {
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
      if (!_matchedAlt) { throw new Error('No group alternative matched'); }
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
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('equalityExpressionNoIn', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('equalityExpressionNoIn', this.position);
        }
      }
    }
  }
  parserelationalExpressionNoIn() {
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
      if (!_matchedAlt) { throw new Error('No group alternative matched'); }
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
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('relationalExpressionNoIn', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('relationalExpressionNoIn', this.position);
        }
      }
    }
  }
  parsevariableDeclarationListNoIn() {
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
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('variableDeclarationListNoIn', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('variableDeclarationListNoIn', this.position);
        }
      }
    }
  }
  parsevariableDeclarationNoIn() {
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
      throw new Error(`Expected one of: 2 alternatives`);
    }

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('variableDeclarationNoIn', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('variableDeclarationNoIn', this.position);
        }
      }
    }
  }
  parseinitializerNoIn() {
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('initializerNoIn', this.position);
    }
    let __ok = false;
    try {
    this.consume('TOKEN__3D_');
    this.parseassignmentExpressionNoIn();

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('initializerNoIn', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('initializerNoIn', this.position);
        }
      }
    }
  }
  parsecontinueStatement() {
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
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('continueStatement', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('continueStatement', this.position);
        }
      }
    }
  }
  parsebreakStatement() {
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
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('breakStatement', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('breakStatement', this.position);
        }
      }
    }
  }
  parsereturnStatement() {
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
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('returnStatement', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('returnStatement', this.position);
        }
      }
    }
  }
  parsewithStatement() {
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
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('withStatement', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('withStatement', this.position);
        }
      }
    }
  }
  parselabelledStatement() {
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
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('labelledStatement', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('labelledStatement', this.position);
        }
      }
    }
  }
  parseswitchStatement() {
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
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('switchStatement', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('switchStatement', this.position);
        }
      }
    }
  }
  parsecaseBlock() {
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
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('caseBlock', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('caseBlock', this.position);
        }
      }
    }
  }
  parsecaseClause() {
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
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('caseClause', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('caseClause', this.position);
        }
      }
    }
  }
  parsedefaultClause() {
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
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('defaultClause', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('defaultClause', this.position);
        }
      }
    }
  }
  parsethrowStatement() {
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
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('throwStatement', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('throwStatement', this.position);
        }
      }
    }
  }
  parsetryStatement() {
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
      if (!_matchedAlt) { throw new Error('No group alternative matched'); }
    }

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('tryStatement', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('tryStatement', this.position);
        }
      }
    }
  }
  parsecatch() {
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
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('catch', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('catch', this.position);
        }
      }
    }
  }
  parsefinally() {
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('finally', this.position);
    }
    let __ok = false;
    try {
    this.consume('TOKEN_finally');
    this.parseblock();

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('finally', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('finally', this.position);
        }
      }
    }
  }
  parsedebuggerStatement() {
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('debuggerStatement', this.position);
    }
    let __ok = false;
    try {
    this.consume('TOKEN_debugger');
    this.parsesemicolon();

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('debuggerStatement', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('debuggerStatement', this.position);
        }
      }
    }
  }
  parsefunctionDeclaration() {
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
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('functionDeclaration', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('functionDeclaration', this.position);
        }
      }
    }
  }
  parseasyncFunctionDeclaration() {
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
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('asyncFunctionDeclaration', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('asyncFunctionDeclaration', this.position);
        }
      }
    }
  }
  parsegeneratorDeclaration() {
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
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('generatorDeclaration', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('generatorDeclaration', this.position);
        }
      }
    }
  }
  parsegeneratorExpression() {
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
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('generatorExpression', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('generatorExpression', this.position);
        }
      }
    }
  }
  parsegeneratorBody() {
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('generatorBody', this.position);
    }
    let __ok = false;
    try {
    this.parsefunctionBody();

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('generatorBody', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('generatorBody', this.position);
        }
      }
    }
  }
  parseasyncFunctionBody() {
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('asyncFunctionBody', this.position);
    }
    let __ok = false;
    try {
    this.parsefunctionBody();

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('asyncFunctionBody', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('asyncFunctionBody', this.position);
        }
      }
    }
  }
  parseclassDeclaration() {
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
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('classDeclaration', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('classDeclaration', this.position);
        }
      }
    }
  }
  parseclassTail() {
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
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('classTail', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('classTail', this.position);
        }
      }
    }
  }
  parseclassHeritage() {
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('classHeritage', this.position);
    }
    let __ok = false;
    try {
    this.consume('TOKEN_extends');
    this.parseleftHandSideExpression();

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('classHeritage', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('classHeritage', this.position);
        }
      }
    }
  }
  parseclassBody() {
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
      throw new Error('Expected at least one classElement');
    }

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('classBody', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('classBody', this.position);
        }
      }
    }
  }
  parseclassElement() {
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
      throw new Error(`Expected one of: 3 alternatives`);
    }

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('classElement', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('classElement', this.position);
        }
      }
    }
  }
  parsemethodDefinition() {
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
      throw new Error(`Expected one of: 5 alternatives`);
    }

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('methodDefinition', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('methodDefinition', this.position);
        }
      }
    }
  }
  parsepropertyDefinition() {
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
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('propertyDefinition', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('propertyDefinition', this.position);
        }
      }
    }
  }
  parsesuperProperty() {
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
      throw new Error(`Expected one of: 2 alternatives`);
    }

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('superProperty', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('superProperty', this.position);
        }
      }
    }
  }
  parsesuperCall() {
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('superCall', this.position);
    }
    let __ok = false;
    try {
    this.consume('TOKEN_super');
    this.parsearguments();

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('superCall', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('superCall', this.position);
        }
      }
    }
  }
  parsemetaProperty() {
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
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('metaProperty', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('metaProperty', this.position);
        }
      }
    }
  }
  parsetemplateLiteral() {
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
      throw new Error(`Expected one of: 2 alternatives`);
    }

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('templateLiteral', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('templateLiteral', this.position);
        }
      }
    }
  }
  parsetemplateSpans() {
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
    this.parsetemplateMiddleList();
    this.consume('TemplateTail');
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      throw new Error(`Expected one of: 2 alternatives`);
    }

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('templateSpans', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('templateSpans', this.position);
        }
      }
    }
  }
  parsetemplateMiddleList() {
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('templateMiddleList', this.position);
    }
    let __ok = false;
    try {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.consume('TemplateMiddle');
    this.parseexpression();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      try {
    this.parsetemplateMiddleList();
    this.consume('TemplateMiddle');
    this.parseexpression();
        _matched = true;
      } catch (e) {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      throw new Error(`Expected one of: 2 alternatives`);
    }

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('templateMiddleList', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('templateMiddleList', this.position);
        }
      }
    }
  }
  parseimportDeclaration() {
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
      throw new Error(`Expected one of: 2 alternatives`);
    }

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('importDeclaration', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('importDeclaration', this.position);
        }
      }
    }
  }
  parseimportClause() {
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
      throw new Error(`Expected one of: 5 alternatives`);
    }

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('importClause', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('importClause', this.position);
        }
      }
    }
  }
  parseimportedDefaultBinding() {
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('importedDefaultBinding', this.position);
    }
    let __ok = false;
    try {
    this.parseimportedBinding();

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('importedDefaultBinding', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('importedDefaultBinding', this.position);
        }
      }
    }
  }
  parsenameSpaceImport() {
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
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('nameSpaceImport', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('nameSpaceImport', this.position);
        }
      }
    }
  }
  parsenamedImports() {
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
      throw new Error(`Expected one of: 3 alternatives`);
    }

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('namedImports', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('namedImports', this.position);
        }
      }
    }
  }
  parsefromClause() {
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('fromClause', this.position);
    }
    let __ok = false;
    try {
    this.consume('TOKEN_from');
    this.parsemoduleSpecifier();

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('fromClause', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('fromClause', this.position);
        }
      }
    }
  }
  parseimportsList() {
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
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('importsList', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('importsList', this.position);
        }
      }
    }
  }
  parseimportSpecifier() {
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
      throw new Error(`Expected one of: 2 alternatives`);
    }

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('importSpecifier', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('importSpecifier', this.position);
        }
      }
    }
  }
  parsemoduleSpecifier() {
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('moduleSpecifier', this.position);
    }
    let __ok = false;
    try {
    this.parsestringLiteral();

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('moduleSpecifier', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('moduleSpecifier', this.position);
        }
      }
    }
  }
  parseimportedBinding() {
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('importedBinding', this.position);
    }
    let __ok = false;
    try {
    this.parsebindingIdentifier();

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('importedBinding', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('importedBinding', this.position);
        }
      }
    }
  }
  parseexportDeclaration() {
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
      throw new Error(`Expected one of: 14 alternatives`);
    }

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('exportDeclaration', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('exportDeclaration', this.position);
        }
      }
    }
  }
  parseexportClause() {
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
      throw new Error(`Expected one of: 3 alternatives`);
    }

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('exportClause', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('exportClause', this.position);
        }
      }
    }
  }
  parseexportsList() {
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
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('exportsList', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('exportsList', this.position);
        }
      }
    }
  }
  parseexportSpecifier() {
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
      throw new Error(`Expected one of: 2 alternatives`);
    }

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('exportSpecifier', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('exportSpecifier', this.position);
        }
      }
    }
  }
  parsescript() {
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
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('script', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('script', this.position);
        }
      }
    }
  }
  parsescriptBody() {
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
      throw new Error('Expected at least one sourceElement');
    }

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('scriptBody', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('scriptBody', this.position);
        }
      }
    }
  }
  parsemodule() {
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
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('module', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('module', this.position);
        }
      }
    }
  }
  parsemoduleBody() {
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
      throw new Error('Expected at least one moduleItem');
    }

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('moduleBody', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('moduleBody', this.position);
        }
      }
    }
  }
  parsemoduleItem() {
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
      throw new Error(`Expected one of: 3 alternatives`);
    }

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('moduleItem', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('moduleItem', this.position);
        }
      }
    }
  }
  parsesemicolon() {
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('semicolon', this.position);
    }
    let __ok = false;
    try {
    this.consume('TOKEN__3B_');

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('semicolon', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('semicolon', this.position);
        }
      }
    }
  }
  parsepropertyIdentifierName() {
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
    this.consume('IdentifierName');
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
      throw new Error(`Expected one of: 4 alternatives`);
    }

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('propertyIdentifierName', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('propertyIdentifierName', this.position);
        }
      }
    }
  }
  parseidentifier() {
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('identifier', this.position);
    }
    let __ok = false;
    try {
    this.consume('Identifier');

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('identifier', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('identifier', this.position);
        }
      }
    }
  }
  parseIgnore() {
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
      throw new Error(`Expected one of: 2 alternatives`);
    }

      __ok = true;
    } finally {
      if (this.eventHandler) {
        if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
          this.eventHandler.endNonterminal('Ignore', this.position);
        }
        if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
          this.eventHandler.abortNonterminal('Ignore', this.position);
        }
      }
    }
  }
}

module.exports = Parser;