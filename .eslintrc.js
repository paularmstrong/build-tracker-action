module.exports = {
  parserOptions: {
    ecmaVersion: 8
  },
  extends: ['prettier'],
  plugins: ['markdown', 'prettier'],
  env: {
    es6: true,
    node: true,
    browser: true
  },
  globals: {
    document: false,
    navigator: false,
    window: false
  },
  rules: {
    'no-console': 'error',
    quotes: 'off',

    'prettier/prettier': ['error', { singleQuote: true, printWidth: 120 }]
  }
};
