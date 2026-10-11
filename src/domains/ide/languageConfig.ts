export type LanguageId = 'javascript' | 'python' | 'cpp' | 'java' | 'go' | 'rust';

export interface LanguageConfig {
  id: LanguageId;
  label: string;
  monacoLanguage: string;
  /** Shown on the editor header, and the name the snippet compiles under. */
  filename: string;
  /** Absent for languages that run in-browser rather than on Wandbox. */
  wandboxCompiler?: string;
  helloWorldTemplate: string;
}

export const SUPPORTED_LANGUAGES: LanguageConfig[] = [
  {
    id: 'javascript',
    label: 'JavaScript',
    monacoLanguage: 'javascript',
    filename: 'main.js',
    helloWorldTemplate: `console.log("Hello, World!");\n\nfunction solve(input) {\n  return input.split('').reverse().join('');\n}\n\n// Try providing stdin!\nconst input = require('fs').readFileSync('/dev/stdin', 'utf-8').trim();\nif (input) {\n  console.log("Reversed input:", solve(input));\n}\n`,
  },
  {
    id: 'python',
    label: 'Python',
    monacoLanguage: 'python',
    filename: 'main.py',
    wandboxCompiler: 'cpython-3.14.0',
    helloWorldTemplate: `import sys\n\nprint("Hello, World!")\n\ndef solve(inp):\n    return inp[::-1]\n\n# Try providing stdin!\nuser_input = sys.stdin.read().strip()\nif user_input:\n    print("Reversed input:", solve(user_input))\n`,
  },
  {
    id: 'cpp',
    label: 'C++',
    monacoLanguage: 'cpp',
    filename: 'main.cpp',
    wandboxCompiler: 'gcc-head',
    helloWorldTemplate: `#include <iostream>\n#include <string>\n#include <algorithm>\n\nusing namespace std;\n\nstring solve(string s) {\n    reverse(s.begin(), s.end());\n    return s;\n}\n\nint main() {\n    cout << "Hello, World!" << endl;\n    string input;\n    if (cin >> input) {\n        cout << "Reversed input: " << solve(input) << endl;\n    }\n    return 0;\n}\n`,
  },
  {
    id: 'java',
    label: 'Java',
    monacoLanguage: 'java',
    filename: 'main.java',
    wandboxCompiler: 'openjdk-jdk-22+36',
    helloWorldTemplate: `import java.util.Scanner;\n\nclass Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, World!");\n        Scanner scanner = new Scanner(System.in);\n        if (scanner.hasNextLine()) {\n            String input = scanner.nextLine();\n            System.out.println("Reversed input: " + new StringBuilder(input).reverse().toString());\n        }\n    }\n}\n`,
  },
  {
    id: 'go',
    label: 'Go',
    monacoLanguage: 'go',
    filename: 'main.go',
    wandboxCompiler: 'go-1.23.2',
    helloWorldTemplate: `package main\n\nimport (\n\t"fmt"\n\t"io"\n\t"os"\n\t"strings"\n)\n\nfunc main() {\n\tfmt.Println("Hello, World!")\n\tinput, _ := io.ReadAll(os.Stdin)\n\ts := strings.TrimSpace(string(input))\n\tif s != "" {\n\t\tr := []rune(s)\n\t\tfor i, j := 0, len(r)-1; i < j; i, j = i+1, j-1 {\n\t\t\tr[i], r[j] = r[j], r[i]\n\t\t}\n\t\tfmt.Printf("Reversed input: %s\\n", string(r))\n\t}\n}\n`,
  },
  {
    id: 'rust',
    label: 'Rust',
    monacoLanguage: 'rust',
    filename: 'main.rs',
    wandboxCompiler: 'rust-1.82.0',
    helloWorldTemplate: `use std::io::{self, Read};\n\nfn main() {\n    println!("Hello, World!");\n    let mut input = String::new();\n    io::stdin().read_to_string(&mut input).unwrap();\n    let input = input.trim();\n    if !input.is_empty() {\n        let reversed: String = input.chars().rev().collect();\n        println!("Reversed input: {}", reversed);\n    }\n}\n`,
  },
];
