import { PrismaClient } from "@prisma/client";

// Extensionless, unlike every other cross-file .ts import in this repo, and
// deliberately so: this file is loaded by two toolchains that disagree about
// the literal `.ts`, and only the bare specifier satisfies both.
// `rewriteRelativeImportExtensions` turns a literal `.ts` into `.js` at
// transpile time, which ts-node then fails to require (its hook registers
// `.ts`, and no `.js` exists next to the source) — that breaks
// `prisma db seed`, and with it `prisma migrate reset`, and with it the
// system-test job. The Dockerfile compiles this file with a bare
// `tsc <file>`, which reads no tsconfig at all, so `.ts` there is a hard
// TS5097 error and the image stops building. Node's own type stripper loads
// neither of them — it never reads this file, only config.variables.ts, whose
// own importers keep the `.ts` the ESM resolver demands.
import { configVariables } from "./config.variables";

export type YamlConfig = {
  [Category in keyof typeof configVariables]: {
    [Key in keyof (typeof configVariables)[Category]]: string;
  };
} & {
  initUser: {
    enabled: string;
    username: string;
    email: string;
    password: string;
    isAdmin: boolean;
    ldapDN: string;
  };
};

const prisma = new PrismaClient({
  datasources: {
    db: {
      url:
        process.env.DATABASE_URL ||
        "file:../data/transfer.db?connection_limit=1",
    },
  },
});

async function seedConfigVariables() {
  for (const [category, configVariablesOfCategory] of Object.entries(
    configVariables,
  )) {
    let order = 0;
    for (const [name, properties] of Object.entries(
      configVariablesOfCategory,
    )) {
      const existingConfigVariable = await prisma.config.findUnique({
        where: { name_category: { name, category } },
      });

      // Create a new config variable if it doesn't exist
      if (!existingConfigVariable) {
        await prisma.config.create({
          data: {
            order,
            name,
            ...properties,
            category,
          },
        });
      }
      order++;
    }
  }
}

async function migrateConfigVariables() {
  const existingConfigVariables = await prisma.config.findMany();
  const orderMap: { [category: string]: number } = {};

  for (const existingConfigVariable of existingConfigVariables) {
    const configVariable =
      configVariables[existingConfigVariable.category]?.[
        existingConfigVariable.name
      ];

    // Delete the config variable if it doesn't exist in the seed
    if (!configVariable) {
      await prisma.config.delete({
        where: {
          name_category: {
            name: existingConfigVariable.name,
            category: existingConfigVariable.category,
          },
        },
      });

      // Update the config variable if it exists in the seed
    } else {
      const variableOrder = Object.keys(
        configVariables[existingConfigVariable.category],
      ).indexOf(existingConfigVariable.name);
      await prisma.config.update({
        where: {
          name_category: {
            name: existingConfigVariable.name,
            category: existingConfigVariable.category,
          },
        },
        data: {
          ...configVariable,
          name: existingConfigVariable.name,
          category: existingConfigVariable.category,
          value: existingConfigVariable.value,
          order: variableOrder,
        },
      });
      orderMap[existingConfigVariable.category] = variableOrder + 1;
    }
  }
}

seedConfigVariables()
  .then(() => migrateConfigVariables())
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
