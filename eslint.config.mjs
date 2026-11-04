// Basic checks that need only ESLint itself (no extra packages).
export default [
	{
		files: ["src/**/*.js"],
		languageOptions: {
			ecmaVersion: 2022,
			sourceType: "module",
			globals: {
				window: "readonly",
				document: "readonly",
				console: "readonly",
				DOMParser: "readonly",
				NodeFilter: "readonly",
				HTMLElement: "readonly",
				HTMLInputElement: "readonly",
				Node: "readonly",
				Element: "readonly",
				// Added to the page by Obsidian
				createDiv: "readonly",
				createEl: "readonly",
				createSpan: "readonly",
				createFragment: "readonly",
			},
		},
		rules: {
			"no-undef": "error",
			"no-unused-vars": ["warn", { args: "none" }],
			"no-redeclare": "error",
			"no-const-assign": "error",
			"no-dupe-keys": "error",
			"no-unreachable": "error",
		},
	},
];
