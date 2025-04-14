export const copyToClipboard = (textToCopy: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (navigator.clipboard && window.isSecureContext) {
        setTimeout(() => {
          navigator.clipboard.writeText(textToCopy)
            .then(resolve)
            .catch(reject);
        });
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = textToCopy;
  
        textArea.style.position = "absolute";
        textArea.style.left = "-999999px";
        document.body.prepend(textArea);
        textArea.select();
  
        try {
          const success = document.execCommand('copy');
          success ? resolve() : reject(new Error('Copy command failed'));
        } catch (err) {
          reject(err);
        } finally {
          textArea.remove();
        }
      }
    });
  };
  