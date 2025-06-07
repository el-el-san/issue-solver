const fs = require('fs');
const path = require('path');
const vm = require('vm');

describe('Syntax Validation', () => {
  const scriptsDir = path.join(__dirname, '..', 'scripts');
  
  // Get all JavaScript files in the scripts directory
  const getJsFiles = (dir) => {
    const files = [];
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        files.push(...getJsFiles(fullPath));
      } else if (item.endsWith('.js')) {
        files.push(fullPath);
      }
    }
    
    return files;
  };

  const jsFiles = getJsFiles(scriptsDir);

  describe('JavaScript files should have valid syntax', () => {
    jsFiles.forEach(file => {
      test(`${path.relative(process.cwd(), file)} should have valid syntax`, () => {
        const content = fs.readFileSync(file, 'utf8');
        
        // Test syntax using vm.compileFunction
        expect(() => {
          new vm.Script(content, { filename: file });
        }).not.toThrow();
      });
    });
  });

  describe('JavaScript files should be loadable as modules', () => {
    jsFiles.forEach(file => {
      // Skip main.js as it may have side effects or require environment variables
      if (path.basename(file) === 'main.js') {
        return;
      }

      test(`${path.relative(process.cwd(), file)} should be loadable as a module`, () => {
        expect(() => {
          // Clear require cache to ensure fresh load
          delete require.cache[require.resolve(file)];
          require(file);
        }).not.toThrow();
      });
    });
  });

  describe('Specific syntax error scenarios', () => {
    test('should detect unmatched braces', () => {
      const invalidCode = `
        function test() {
          return 'hello';
        }
        }  // Extra brace like the original issue
      `;
      
      expect(() => {
        new vm.Script(invalidCode);
      }).toThrow();
    });

    test('should detect missing braces', () => {
      const invalidCode = `
        function test() {
          return 'hello';
        // Missing closing brace
      `;
      
      expect(() => {
        new vm.Script(invalidCode);
      }).toThrow();
    });

    test('should detect invalid function declarations', () => {
      const invalidCode = `
        function test() {
        }
        function {  // Missing function name
          return 'hello';
        }
      `;
      
      expect(() => {
        new vm.Script(invalidCode);
      }).toThrow();
    });
  });
});