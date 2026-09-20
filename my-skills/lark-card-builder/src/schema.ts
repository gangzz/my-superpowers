import { z } from "zod";

import { OFFICIAL_LIMITS } from "./official-limits.js";
import {
  HEADER_THEMES,
  SUPPORTED_ICON_TOKENS,
  TAG_COLORS,
} from "./snapshot.js";
import type {
  BlockSpec,
  CardSpec,
  ComponentSpec,
  JsonValue,
} from "./types.js";

const identifierSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[A-Za-z][A-Za-z0-9._:-]*$/);

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

const textSpecSchema = z.strictObject({
  kind: z.enum(["plainText", "larkMd"]),
  content: z.string(),
  textSize: z.string().min(1).optional(),
  textColor: z.string().min(1).optional(),
  textAlign: z.enum(["left", "center", "right"]).optional(),
  lines: z.number().int().positive().optional(),
});

const standardIconSchema = z.strictObject({
  kind: z.literal("standardIcon"),
  token: z.enum(SUPPORTED_ICON_TOKENS),
  color: z.string().min(1).optional(),
  size: z.string().min(1).optional(),
});

const customIconSchema = z.strictObject({
  kind: z.literal("customIcon"),
  imageKey: z.string().min(1),
});

const iconSchema = z.discriminatedUnion("kind", [
  standardIconSchema,
  customIconSchema,
]);

const callbackBehaviorSchema = z.strictObject({
  kind: z.literal("callback"),
  value: z.record(z.string(), jsonValueSchema),
});

const openUrlBehaviorSchema = z.strictObject({
  kind: z.literal("openUrl"),
  defaultUrl: z.string().min(1),
  pcUrl: z.string().min(1).optional(),
  iosUrl: z.string().min(1).optional(),
  androidUrl: z.string().min(1).optional(),
});

const behaviorSchema = z.discriminatedUnion("kind", [
  callbackBehaviorSchema,
  openUrlBehaviorSchema,
]);

const confirmSchema = z.strictObject({
  title: z.string().min(1),
  text: z.string().optional(),
});

const commonComponentShape = {
  key: identifierSchema.optional(),
  streamTarget: z.boolean().optional(),
  margin: z.string().min(1).optional(),
};

const markdownFragmentSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("text"), text: z.string() }),
  z.strictObject({ kind: z.literal("boldText"), text: z.string() }),
  z.strictObject({ kind: z.literal("lineBreak") }),
  z.strictObject({
    kind: z.literal("link"),
    label: z.string(),
    url: z.string().min(1),
  }),
  z.strictObject({ kind: z.literal("rawMarkdown"), markdown: z.string() }),
]);

export const componentSpecSchema: z.ZodType<ComponentSpec> = z.lazy(() =>
  z.discriminatedUnion("kind", [
    z.strictObject({
      kind: z.literal("markdown"),
      content: z.string().optional(),
      fragments: z.array(markdownFragmentSchema).min(1).optional(),
      textSize: z.string().min(1).optional(),
      textAlign: z.enum(["left", "center", "right"]).optional(),
      color: z.string().min(1).optional(),
      icon: iconSchema.optional(),
      ...commonComponentShape,
    }),
    z.strictObject({
      kind: z.literal("div"),
      text: textSpecSchema.optional(),
      fields: z
        .array(
          z.strictObject({
            short: z.boolean().optional(),
            text: textSpecSchema,
          }),
        )
        .optional(),
      icon: iconSchema.optional(),
      width: z.string().min(1).optional(),
      ...commonComponentShape,
    }),
    z.strictObject({
      kind: z.literal("hr"),
      ...commonComponentShape,
    }),
    z.strictObject({
      kind: z.literal("image"),
      imageKey: z.string().min(1),
      alt: z.string(),
      title: z.string().optional(),
      scaleType: z.enum(["cropCenter", "cropTop", "fitHorizontal"]).optional(),
      size: z.string().min(1).optional(),
      cornerRadius: z.string().min(1).optional(),
      transparent: z.boolean().optional(),
      preview: z.boolean().optional(),
      ...commonComponentShape,
    }),
    z.strictObject({
      kind: z.literal("button"),
      text: z.string().min(1).max(OFFICIAL_LIMITS.buttonTextChars.value),
      appearance: z
        .enum([
          "default",
          "primary",
          "danger",
          "text",
          "primaryText",
          "dangerText",
          "primaryFilled",
          "dangerFilled",
          "laser",
        ])
        .optional(),
      size: z.enum(["tiny", "small", "medium", "large"]).optional(),
      width: z.string().min(1).optional(),
      behaviors: z.array(behaviorSchema).min(1).optional(),
      icon: iconSchema.optional(),
      hoverTips: z.string().optional(),
      disabled: z.boolean().optional(),
      disabledTips: z.string().optional(),
      confirm: confirmSchema.optional(),
      name: identifierSchema.optional(),
      formAction: z.enum(["submit", "reset"]).optional(),
      ...commonComponentShape,
    }),
    z.strictObject({
      kind: z.literal("input"),
      name: identifierSchema.optional(),
      required: z.boolean().optional(),
      placeholder: z
        .string()
        .max(OFFICIAL_LIMITS.inputPlaceholderChars.value)
        .optional(),
      defaultValue: z.string().optional(),
      label: z.string().optional(),
      labelPosition: z.enum(["top", "left"]).optional(),
      inputType: z.enum(["text", "multilineText", "password"]).optional(),
      rows: z.number().int().positive().optional(),
      autoResize: z.boolean().optional(),
      maxRows: z.number().int().positive().optional(),
      maxLength: z
        .number()
        .int()
        .min(1)
        .max(OFFICIAL_LIMITS.inputMaxLength.value)
        .optional(),
      showIcon: z.boolean().optional(),
      width: z.string().min(1).optional(),
      disabled: z.boolean().optional(),
      disabledTips: z.string().optional(),
      behaviors: z.array(behaviorSchema).min(1).optional(),
      confirm: confirmSchema.optional(),
      ...commonComponentShape,
    }),
    z.strictObject({
      kind: z.literal("staticSelect"),
      options: z
        .array(
          z.strictObject({
            text: z.string().min(1),
            value: z.string().min(1),
            icon: iconSchema.optional(),
          }),
        )
        .min(1),
      name: identifierSchema.optional(),
      required: z.boolean().optional(),
      appearance: z.enum(["default", "text"]).optional(),
      placeholder: z.string().optional(),
      initialOption: z.string().optional(),
      initialIndex: z.number().int().nonnegative().optional(),
      width: z.string().min(1).optional(),
      disabled: z.boolean().optional(),
      disabledTips: z.string().optional(),
      behaviors: z.array(behaviorSchema).min(1).optional(),
      confirm: confirmSchema.optional(),
      ...commonComponentShape,
    }),
    z.strictObject({
      kind: z.literal("form"),
      name: identifierSchema,
      components: z.array(componentSpecSchema).min(1),
      direction: z.enum(["vertical", "horizontal"]).optional(),
      horizontalSpacing: z.string().min(1).optional(),
      verticalSpacing: z.string().min(1).optional(),
      horizontalAlign: z.enum(["left", "center", "right"]).optional(),
      verticalAlign: z.enum(["top", "center", "bottom"]).optional(),
      padding: z.string().min(1).optional(),
      ...commonComponentShape,
    }),
    z.strictObject({
      kind: z.literal("table"),
      columns: z
        .array(
          z.strictObject({
            name: identifierSchema,
            displayName: z.string().optional(),
            dataType: z.enum([
              "text",
              "larkMd",
              "number",
              "options",
              "persons",
              "date",
              "markdown",
            ]),
            width: z.string().min(1).optional(),
            horizontalAlign: z.enum(["left", "center", "right"]).optional(),
            verticalAlign: z.enum(["top", "center", "bottom"]).optional(),
            dateFormat: z.string().optional(),
            numberFormat: z
              .strictObject({
                precision: z.number().int().nonnegative().optional(),
                symbol: z.string().optional(),
                separator: z.boolean().optional(),
              })
              .optional(),
          }),
        )
        .min(1)
        .max(OFFICIAL_LIMITS.tableColumns.value),
      rows: z.array(z.record(z.string(), jsonValueSchema)),
      pageSize: z.number().int().min(1).max(10).optional(),
      rowHeight: z.string().min(1).optional(),
      rowMaxHeight: z.string().min(1).optional(),
      freezeFirstColumn: z.boolean().optional(),
      headerStyle: z
        .strictObject({
          textAlign: z.enum(["left", "center", "right"]).optional(),
          textSize: z.string().min(1).optional(),
          backgroundStyle: z.enum(["grey", "none"]).optional(),
          textColor: z.string().min(1).optional(),
          bold: z.boolean().optional(),
          lines: z.number().int().positive().optional(),
        })
        .optional(),
      ...commonComponentShape,
    }),
    z.strictObject({
      kind: z.literal("column"),
      components: z.array(componentSpecSchema),
      width: z.string().min(1).optional(),
      weight: z.number().int().min(1).max(5).optional(),
      verticalAlign: z.enum(["top", "center", "bottom"]).optional(),
      direction: z.enum(["vertical", "horizontal"]).optional(),
      horizontalSpacing: z.string().min(1).optional(),
      verticalSpacing: z.string().min(1).optional(),
      padding: z.string().min(1).optional(),
      backgroundStyle: z.string().min(1).optional(),
      cornerRadius: z.string().min(1).optional(),
      openUrl: z.string().min(1).optional(),
      ...commonComponentShape,
    }),
    z.strictObject({
      kind: z.literal("columnSet"),
      columns: z.array(componentSpecSchema).min(1),
      flexMode: z.enum(["none", "stretch", "flow", "bisect", "trisect"]).optional(),
      horizontalSpacing: z.string().min(1).optional(),
      horizontalAlign: z.enum(["left", "center", "right"]).optional(),
      backgroundStyle: z.string().min(1).optional(),
      openUrl: z.string().min(1).optional(),
      ...commonComponentShape,
    }),
    z.strictObject({
      kind: z.literal("collapsiblePanel"),
      header: z.strictObject({
        title: textSpecSchema.optional(),
        backgroundColor: z.string().min(1).optional(),
        width: z.enum(["fill", "auto", "autoWhenFold"]).optional(),
        verticalAlign: z.enum(["top", "center", "bottom"]).optional(),
        icon: iconSchema.optional(),
        iconPosition: z.enum(["left", "right", "followText"]).optional(),
        iconExpandedAngle: z.union([
          z.literal(-180),
          z.literal(-90),
          z.literal(90),
          z.literal(180),
        ]).optional(),
      }),
      components: z.array(componentSpecSchema),
      expanded: z.boolean().optional(),
      backgroundColor: z.string().min(1).optional(),
      border: z
        .strictObject({
          color: z.string().min(1).optional(),
          cornerRadius: z.string().min(1).optional(),
        })
        .optional(),
      direction: z.enum(["vertical", "horizontal"]).optional(),
      verticalSpacing: z.string().min(1).optional(),
      horizontalSpacing: z.string().min(1).optional(),
      padding: z.string().min(1).optional(),
      ...commonComponentShape,
    }),
    z.strictObject({
      kind: z.literal("interactiveContainer"),
      components: z.array(componentSpecSchema),
      behaviors: z.array(behaviorSchema).min(1),
      width: z.string().min(1).optional(),
      height: z.string().min(1).optional(),
      direction: z.enum(["vertical", "horizontal"]).optional(),
      horizontalAlign: z.enum(["left", "center", "right"]).optional(),
      verticalAlign: z.enum(["top", "center", "bottom"]).optional(),
      backgroundStyle: z.string().min(1).optional(),
      hasBorder: z.boolean().optional(),
      borderColor: z.string().min(1).optional(),
      cornerRadius: z.string().min(1).optional(),
      padding: z.string().min(1).optional(),
      disabled: z.boolean().optional(),
      disabledTips: z.string().optional(),
      hoverTips: z.string().optional(),
      confirm: confirmSchema.optional(),
      ...commonComponentShape,
    }),
  ]),
) as z.ZodType<ComponentSpec>;

export const blockSpecSchema: z.ZodType<BlockSpec> = z.strictObject({
  kind: z.literal("block"),
  components: z.array(componentSpecSchema).min(1),
});

export const cardSpecSchema = z.strictObject({
  specVersion: z.literal(1),
  kind: z.literal("card"),
  cardKey: identifierSchema.optional(),
  config: z
    .strictObject({
      updateMulti: z.literal(true).optional(),
      widthMode: z.enum(["default", "compact", "fill"]).optional(),
      enableForward: z.boolean().optional(),
      summary: z.string().optional(),
      streamingMode: z.boolean().optional(),
      streamingConfig: z
        .strictObject({
          printFrequencyMs: z
            .strictObject({
              default: z.number().int().positive().optional(),
              android: z.number().int().positive().optional(),
              ios: z.number().int().positive().optional(),
              pc: z.number().int().positive().optional(),
            })
            .optional(),
          printStep: z
            .strictObject({
              default: z.number().int().positive().optional(),
              android: z.number().int().positive().optional(),
              ios: z.number().int().positive().optional(),
              pc: z.number().int().positive().optional(),
            })
            .optional(),
          printStrategy: z.enum(["fast", "delay"]).optional(),
        })
        .optional(),
      textStyles: z
        .record(
          identifierSchema,
          z.strictObject({
            default: z.string().min(1),
            pc: z.string().min(1).optional(),
            mobile: z.string().min(1).optional(),
          }),
        )
        .optional(),
      colorStyles: z
        .record(
          identifierSchema,
          z.strictObject({
            lightMode: z.string().regex(/^rgba\(/),
            darkMode: z.string().regex(/^rgba\(/),
          }),
        )
        .optional(),
    })
    .optional(),
  header: z
    .strictObject({
      title: textSpecSchema,
      subtitle: textSpecSchema.optional(),
      theme: z.enum(HEADER_THEMES).optional(),
      tags: z
        .array(
          z.strictObject({
            text: z.string().min(1),
            color: z.enum(TAG_COLORS).optional(),
          }),
        )
        .max(OFFICIAL_LIMITS.headerTags.value)
        .optional(),
      icon: iconSchema.optional(),
      padding: z.string().min(1).optional(),
    })
    .optional(),
  body: z
    .strictObject({
      direction: z.enum(["vertical", "horizontal"]).optional(),
      padding: z.string().min(1).optional(),
      horizontalSpacing: z.string().min(1).optional(),
      verticalSpacing: z.string().min(1).optional(),
      horizontalAlign: z.enum(["left", "center", "right"]).optional(),
      verticalAlign: z.enum(["top", "center", "bottom"]).optional(),
    })
    .optional(),
  cardLink: z
    .strictObject({
      url: z.string().min(1),
      pcUrl: z.string().min(1).optional(),
      iosUrl: z.string().min(1).optional(),
      androidUrl: z.string().min(1).optional(),
    })
    .optional(),
  blocks: z.array(blockSpecSchema).min(1),
}) as unknown as z.ZodType<CardSpec>;

export function cardSpecJsonSchema(): unknown {
  return z.toJSONSchema(cardSpecSchema, { target: "draft-2020-12" });
}
