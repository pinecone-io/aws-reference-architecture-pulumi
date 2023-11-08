module.exports = {
  hooks: {
    readPackage(packageJson) {
      switch (packageJson.name) {
        case "onnxruntime-node":
          packageJson.dependencies = {};
          break;
      }
      return packageJson;
    },
  },
};
