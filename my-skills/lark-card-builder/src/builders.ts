import {
  buildOrThrowCardSpec,
  compileCardSpec,
} from "./compiler.js";
import type { SupportedIconToken } from "./snapshot.js";
import type {
  BaseComponentSpec,
  BehaviorSpec,
  BlockSpec,
  BodyLayoutSpec,
  ButtonSpec,
  CardConfigSpec,
  CardLinkSpec,
  CardSpec,
  CollapsiblePanelSpec,
  ColumnSetSpec,
  ColumnSpec,
  CompileOptions,
  ComponentSpec,
  ConfirmSpec,
  DivSpec,
  FormSpec,
  HeaderSpec,
  HrSpec,
  IconSpec,
  ImageSpec,
  InputSpec,
  InteractiveContainerSpec,
  JsonObject,
  MarkdownSpec,
  StaticSelectSpec,
  TableColumnSpec,
  TableHeaderStyleSpec,
  TableSpec,
  TextKind,
  TextSpec,
} from "./types.js";

export interface SpecBuilder<T> {
  toSpec(): T;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function unwrap<T>(input: T | SpecBuilder<T>): T {
  return "toSpec" in (input as object)
    ? (input as SpecBuilder<T>).toSpec()
    : clone(input as T);
}

function escapeMarkdownText(value: string): string {
  return value.replace(/[\\`*{}\[\]()#+\-.!_~<>:|]/g, "\\$&");
}

abstract class ComponentBuilder<T extends BaseComponentSpec>
  implements SpecBuilder<T>
{
  protected constructor(protected readonly spec: T) {}

  protected abstract recreate(spec: T): this;

  key(value: string): this {
    return this.recreate({ ...this.spec, key: value });
  }

  streamTarget(enabled = true): this {
    return this.recreate({ ...this.spec, streamTarget: enabled });
  }

  margin(value: string): this {
    return this.recreate({ ...this.spec, margin: value });
  }

  toSpec(): T {
    return clone(this.spec);
  }
}

export function plainText(content: string): TextSpec {
  return { kind: "plainText", content };
}

export function larkMd(content: string): TextSpec {
  return { kind: "larkMd", content };
}

export function standardIcon(
  token: SupportedIconToken,
  options: { color?: string; size?: string } = {},
): IconSpec {
  return { kind: "standardIcon", token, ...options };
}

export function customIcon(imageKey: string): IconSpec {
  return { kind: "customIcon", imageKey };
}

export class HeaderBuilder implements SpecBuilder<HeaderSpec> {
  constructor(private readonly spec: HeaderSpec) {}

  theme(value: NonNullable<HeaderSpec["theme"]>): HeaderBuilder {
    return new HeaderBuilder({ ...this.spec, theme: value });
  }

  subtitle(content: string, kind: TextKind = "plainText"): HeaderBuilder {
    return new HeaderBuilder({
      ...this.spec,
      subtitle: { kind, content },
    });
  }

  icon(value: IconSpec): HeaderBuilder {
    return new HeaderBuilder({ ...this.spec, icon: clone(value) });
  }

  tag(text: string, color?: string): HeaderBuilder {
    const tag = color === undefined ? { text } : { text, color };
    return new HeaderBuilder({
      ...this.spec,
      tags: [...(this.spec.tags ?? []), tag],
    });
  }

  padding(value: string): HeaderBuilder {
    return new HeaderBuilder({ ...this.spec, padding: value });
  }

  titleKind(kind: TextKind): HeaderBuilder {
    return new HeaderBuilder({
      ...this.spec,
      title: { ...this.spec.title, kind },
    });
  }

  toSpec(): HeaderSpec {
    return clone(this.spec);
  }
}

export function header(title: string): HeaderBuilder {
  return new HeaderBuilder({ title: plainText(title) });
}

export class MarkdownBuilder extends ComponentBuilder<MarkdownSpec> {
  constructor(spec: MarkdownSpec) {
    super(spec);
  }

  protected recreate(spec: MarkdownSpec): this {
    return new MarkdownBuilder(spec) as this;
  }

  text(value: string): this {
    return this.recreate({
      ...this.spec,
      content: (this.spec.content ?? "") + escapeMarkdownText(value),
    });
  }

  markdown(value: string): this {
    return this.recreate({ ...this.spec, content: (this.spec.content ?? "") + value });
  }

  bold(value: string): this {
    return this.recreate({
      ...this.spec,
      content: `${this.spec.content ?? ""}**${escapeMarkdownText(value)}**`,
    });
  }

  link(label: string, url: string): this {
    return this.recreate({
      ...this.spec,
      content: `${this.spec.content ?? ""}[${escapeMarkdownText(label)}](${url})`,
    });
  }

  lineBreak(): this {
    return this.recreate({ ...this.spec, content: `${this.spec.content ?? ""}\n` });
  }

  color(value: string): this {
    return this.recreate({ ...this.spec, color: value });
  }

  textSize(value: string): this {
    return this.recreate({ ...this.spec, textSize: value });
  }

  align(value: NonNullable<MarkdownSpec["textAlign"]>): this {
    return this.recreate({ ...this.spec, textAlign: value });
  }

  icon(value: IconSpec): this {
    return this.recreate({ ...this.spec, icon: clone(value) });
  }
}

export function markdown(content = ""): MarkdownBuilder {
  return new MarkdownBuilder({ kind: "markdown", content });
}

export class DivBuilder extends ComponentBuilder<DivSpec> {
  constructor(spec: DivSpec) {
    super(spec);
  }

  protected recreate(spec: DivSpec): this {
    return new DivBuilder(spec) as this;
  }

  text(content: string, kind: TextKind = "plainText"): this {
    return this.recreate({ ...this.spec, text: { kind, content } });
  }

  textStyle(options: Omit<TextSpec, "kind" | "content">): this {
    if (!this.spec.text) return this;
    return this.recreate({
      ...this.spec,
      text: { ...this.spec.text, ...options },
    });
  }

  field(content: string, short = false, kind: TextKind = "larkMd"): this {
    return this.recreate({
      ...this.spec,
      fields: [
        ...(this.spec.fields ?? []),
        { short, text: { kind, content } },
      ],
    });
  }

  icon(value: IconSpec): this {
    return this.recreate({ ...this.spec, icon: clone(value) });
  }

  width(value: string): this {
    return this.recreate({ ...this.spec, width: value });
  }

}

export function div(content?: string): DivBuilder {
  return new DivBuilder({
    kind: "div",
    ...(content === undefined ? {} : { text: plainText(content) }),
  });
}

export class HrBuilder extends ComponentBuilder<HrSpec> {
  constructor(spec: HrSpec = { kind: "hr" }) {
    super(spec);
  }

  protected recreate(spec: HrSpec): this {
    return new HrBuilder(spec) as this;
  }
}

export function hr(): HrBuilder {
  return new HrBuilder();
}

export class ImageBuilder extends ComponentBuilder<ImageSpec> {
  constructor(spec: ImageSpec) {
    super(spec);
  }

  protected recreate(spec: ImageSpec): this {
    return new ImageBuilder(spec) as this;
  }

  title(value: string): this {
    return this.recreate({ ...this.spec, title: value });
  }

  scale(value: NonNullable<ImageSpec["scaleType"]>): this {
    return this.recreate({ ...this.spec, scaleType: value });
  }

  size(value: string): this {
    return this.recreate({ ...this.spec, size: value });
  }

  cornerRadius(value: string): this {
    return this.recreate({ ...this.spec, cornerRadius: value });
  }

  transparent(value = true): this {
    return this.recreate({ ...this.spec, transparent: value });
  }

  preview(value = true): this {
    return this.recreate({ ...this.spec, preview: value });
  }
}

export function image(imageKey: string, alt = ""): ImageBuilder {
  return new ImageBuilder({ kind: "image", imageKey, alt });
}

export class ButtonBuilder extends ComponentBuilder<ButtonSpec> {
  constructor(spec: ButtonSpec) {
    super(spec);
  }

  protected recreate(spec: ButtonSpec): this {
    return new ButtonBuilder(spec) as this;
  }

  appearance(value: NonNullable<ButtonSpec["appearance"]>): this {
    return this.recreate({ ...this.spec, appearance: value });
  }

  size(value: NonNullable<ButtonSpec["size"]>): this {
    return this.recreate({ ...this.spec, size: value });
  }

  width(value: string): this {
    return this.recreate({ ...this.spec, width: value });
  }

  callback(value: JsonObject): this {
    return this.recreate({
      ...this.spec,
      behaviors: [
        ...(this.spec.behaviors ?? []),
        { kind: "callback", value: clone(value) },
      ],
    });
  }

  openUrl(defaultUrl: string): this {
    return this.recreate({
      ...this.spec,
      behaviors: [
        ...(this.spec.behaviors ?? []),
        { kind: "openUrl", defaultUrl },
      ],
    });
  }

  icon(value: IconSpec): this {
    return this.recreate({ ...this.spec, icon: clone(value) });
  }

  hoverTips(value: string): this {
    return this.recreate({ ...this.spec, hoverTips: value });
  }

  disabled(value = true, tips?: string): this {
    return this.recreate({
      ...this.spec,
      disabled: value,
      ...(tips === undefined ? {} : { disabledTips: tips }),
    });
  }

  confirm(title: string, text?: string): this {
    const confirm: ConfirmSpec = text === undefined ? { title } : { title, text };
    return this.recreate({ ...this.spec, confirm });
  }

  formAction(name: string, action: "submit" | "reset"): this {
    const { behaviors: _behaviors, ...rest } = this.spec;
    return this.recreate({ ...rest, name, formAction: action });
  }
}

export function button(text: string): ButtonBuilder {
  return new ButtonBuilder({ kind: "button", text });
}

export class InputBuilder extends ComponentBuilder<InputSpec> {
  constructor(spec: InputSpec) {
    super(spec);
  }

  protected recreate(spec: InputSpec): this {
    return new InputBuilder(spec) as this;
  }

  name(value: string): this {
    return this.recreate({ ...this.spec, name: value });
  }

  required(value = true): this {
    return this.recreate({ ...this.spec, required: value });
  }

  placeholder(value: string): this {
    return this.recreate({ ...this.spec, placeholder: value });
  }

  defaultValue(value: string): this {
    return this.recreate({ ...this.spec, defaultValue: value });
  }

  label(value: string, position: "top" | "left" = "top"): this {
    return this.recreate({ ...this.spec, label: value, labelPosition: position });
  }

  inputType(value: NonNullable<InputSpec["inputType"]>): this {
    return this.recreate({ ...this.spec, inputType: value });
  }

  rows(value: number): this {
    return this.recreate({ ...this.spec, rows: value });
  }

  autoResize(maxRows?: number): this {
    return this.recreate({
      ...this.spec,
      autoResize: true,
      ...(maxRows === undefined ? {} : { maxRows }),
    });
  }

  maxLength(value: number): this {
    return this.recreate({ ...this.spec, maxLength: value });
  }

  width(value: string): this {
    return this.recreate({ ...this.spec, width: value });
  }

  disabled(value = true, tips?: string): this {
    return this.recreate({
      ...this.spec,
      disabled: value,
      ...(tips === undefined ? {} : { disabledTips: tips }),
    });
  }

  callback(value: JsonObject): this {
    return this.recreate({
      ...this.spec,
      behaviors: [
        ...(this.spec.behaviors ?? []),
        { kind: "callback", value: clone(value) },
      ],
    });
  }
}

export function input(name?: string): InputBuilder {
  return new InputBuilder({ kind: "input", ...(name === undefined ? {} : { name }) });
}

export class StaticSelectBuilder extends ComponentBuilder<StaticSelectSpec> {
  constructor(spec: StaticSelectSpec) {
    super(spec);
  }

  protected recreate(spec: StaticSelectSpec): this {
    return new StaticSelectBuilder(spec) as this;
  }

  option(text: string, value: string, icon?: IconSpec): this {
    return this.recreate({
      ...this.spec,
      options: [
        ...this.spec.options,
        { text, value, ...(icon === undefined ? {} : { icon: clone(icon) }) },
      ],
    });
  }

  name(value: string): this {
    return this.recreate({ ...this.spec, name: value });
  }

  required(value = true): this {
    return this.recreate({ ...this.spec, required: value });
  }

  appearance(value: "default" | "text"): this {
    return this.recreate({ ...this.spec, appearance: value });
  }

  placeholder(value: string): this {
    return this.recreate({ ...this.spec, placeholder: value });
  }

  initialOption(value: string): this {
    return this.recreate({ ...this.spec, initialOption: value });
  }

  initialIndex(value: number): this {
    return this.recreate({ ...this.spec, initialIndex: value });
  }

  width(value: string): this {
    return this.recreate({ ...this.spec, width: value });
  }

  disabled(value = true, tips?: string): this {
    return this.recreate({
      ...this.spec,
      disabled: value,
      ...(tips === undefined ? {} : { disabledTips: tips }),
    });
  }

  callback(value: JsonObject): this {
    return this.recreate({
      ...this.spec,
      behaviors: [
        ...(this.spec.behaviors ?? []),
        { kind: "callback", value: clone(value) },
      ],
    });
  }
}

export function staticSelect(): StaticSelectBuilder {
  return new StaticSelectBuilder({ kind: "staticSelect", options: [] });
}

export type AnyComponentBuilder = SpecBuilder<ComponentSpec>;
export type ComponentInput = ComponentSpec | AnyComponentBuilder;

function componentSpec(input: ComponentInput): ComponentSpec {
  return unwrap(input);
}

export class FormBuilder extends ComponentBuilder<FormSpec> {
  constructor(spec: FormSpec) {
    super(spec);
  }

  protected recreate(spec: FormSpec): this {
    return new FormBuilder(spec) as this;
  }

  add(value: ComponentInput): this {
    return this.recreate({
      ...this.spec,
      components: [...this.spec.components, componentSpec(value)],
    });
  }

  direction(value: "vertical" | "horizontal"): this {
    return this.recreate({ ...this.spec, direction: value });
  }

  spacing(horizontal: string, vertical = horizontal): this {
    return this.recreate({
      ...this.spec,
      horizontalSpacing: horizontal,
      verticalSpacing: vertical,
    });
  }

  padding(value: string): this {
    return this.recreate({ ...this.spec, padding: value });
  }
}

export function form(name: string): FormBuilder {
  return new FormBuilder({ kind: "form", name, components: [] });
}

export class TableBuilder extends ComponentBuilder<TableSpec> {
  constructor(spec: TableSpec) {
    super(spec);
  }

  protected recreate(spec: TableSpec): this {
    return new TableBuilder(spec) as this;
  }

  column(value: TableColumnSpec): this {
    return this.recreate({
      ...this.spec,
      columns: [...this.spec.columns, clone(value)],
    });
  }

  row(value: JsonObject): this {
    return this.recreate({ ...this.spec, rows: [...this.spec.rows, clone(value)] });
  }

  pageSize(value: number): this {
    return this.recreate({ ...this.spec, pageSize: value });
  }

  rowHeight(value: string, maxHeight?: string): this {
    return this.recreate({
      ...this.spec,
      rowHeight: value,
      ...(maxHeight === undefined ? {} : { rowMaxHeight: maxHeight }),
    });
  }

  freezeFirstColumn(value = true): this {
    return this.recreate({ ...this.spec, freezeFirstColumn: value });
  }

  headerStyle(value: TableHeaderStyleSpec): this {
    return this.recreate({ ...this.spec, headerStyle: clone(value) });
  }
}

export function table(): TableBuilder {
  return new TableBuilder({ kind: "table", columns: [], rows: [] });
}

export class ColumnBuilder extends ComponentBuilder<ColumnSpec> {
  constructor(spec: ColumnSpec) {
    super(spec);
  }

  protected recreate(spec: ColumnSpec): this {
    return new ColumnBuilder(spec) as this;
  }

  add(value: ComponentInput): this {
    return this.recreate({
      ...this.spec,
      components: [...this.spec.components, componentSpec(value)],
    });
  }

  width(value: string, weight?: number): this {
    return this.recreate({
      ...this.spec,
      width: value,
      ...(weight === undefined ? {} : { weight }),
    });
  }

  direction(value: "vertical" | "horizontal"): this {
    return this.recreate({ ...this.spec, direction: value });
  }

  padding(value: string): this {
    return this.recreate({ ...this.spec, padding: value });
  }

  background(value: string): this {
    return this.recreate({ ...this.spec, backgroundStyle: value });
  }

  cornerRadius(value: string): this {
    return this.recreate({ ...this.spec, cornerRadius: value });
  }

  openUrl(value: string): this {
    return this.recreate({ ...this.spec, openUrl: value });
  }
}

export function column(): ColumnBuilder {
  return new ColumnBuilder({ kind: "column", components: [] });
}

export class ColumnSetBuilder extends ComponentBuilder<ColumnSetSpec> {
  constructor(spec: ColumnSetSpec) {
    super(spec);
  }

  protected recreate(spec: ColumnSetSpec): this {
    return new ColumnSetBuilder(spec) as this;
  }

  add(value: ColumnBuilder | ColumnSpec): this {
    return this.recreate({
      ...this.spec,
      columns: [...this.spec.columns, unwrap(value)],
    });
  }

  flex(value: NonNullable<ColumnSetSpec["flexMode"]>): this {
    return this.recreate({ ...this.spec, flexMode: value });
  }

  spacing(value: string): this {
    return this.recreate({ ...this.spec, horizontalSpacing: value });
  }

  background(value: string): this {
    return this.recreate({ ...this.spec, backgroundStyle: value });
  }

  openUrl(value: string): this {
    return this.recreate({ ...this.spec, openUrl: value });
  }
}

export function columnSet(): ColumnSetBuilder {
  return new ColumnSetBuilder({ kind: "columnSet", columns: [] });
}

export class CollapsiblePanelBuilder extends ComponentBuilder<CollapsiblePanelSpec> {
  constructor(spec: CollapsiblePanelSpec) {
    super(spec);
  }

  protected recreate(spec: CollapsiblePanelSpec): this {
    return new CollapsiblePanelBuilder(spec) as this;
  }

  add(value: ComponentInput): this {
    return this.recreate({
      ...this.spec,
      components: [...this.spec.components, componentSpec(value)],
    });
  }

  expanded(value = true): this {
    return this.recreate({ ...this.spec, expanded: value });
  }

  background(value: string): this {
    return this.recreate({ ...this.spec, backgroundColor: value });
  }

  border(color: string, cornerRadius?: string): this {
    return this.recreate({
      ...this.spec,
      border: { color, ...(cornerRadius === undefined ? {} : { cornerRadius }) },
    });
  }

  padding(value: string): this {
    return this.recreate({ ...this.spec, padding: value });
  }
}

export function collapsiblePanel(title: string): CollapsiblePanelBuilder {
  return new CollapsiblePanelBuilder({
    kind: "collapsiblePanel",
    header: { title: plainText(title) },
    components: [],
  });
}

export class InteractiveContainerBuilder extends ComponentBuilder<InteractiveContainerSpec> {
  constructor(spec: InteractiveContainerSpec) {
    super(spec);
  }

  protected recreate(spec: InteractiveContainerSpec): this {
    return new InteractiveContainerBuilder(spec) as this;
  }

  add(value: ComponentInput): this {
    return this.recreate({
      ...this.spec,
      components: [...this.spec.components, componentSpec(value)],
    });
  }

  callback(value: JsonObject): this {
    return this.addBehavior({ kind: "callback", value: clone(value) });
  }

  openUrl(defaultUrl: string): this {
    return this.addBehavior({ kind: "openUrl", defaultUrl });
  }

  private addBehavior(value: BehaviorSpec): this {
    return this.recreate({
      ...this.spec,
      behaviors: [...this.spec.behaviors, value],
    });
  }

  size(width: string, height?: string): this {
    return this.recreate({
      ...this.spec,
      width,
      ...(height === undefined ? {} : { height }),
    });
  }

  background(value: string): this {
    return this.recreate({ ...this.spec, backgroundStyle: value });
  }

  border(color: string, cornerRadius?: string): this {
    return this.recreate({
      ...this.spec,
      hasBorder: true,
      borderColor: color,
      ...(cornerRadius === undefined ? {} : { cornerRadius }),
    });
  }

  padding(value: string): this {
    return this.recreate({ ...this.spec, padding: value });
  }
}

export function interactiveContainer(): InteractiveContainerBuilder {
  return new InteractiveContainerBuilder({
    kind: "interactiveContainer",
    components: [],
    behaviors: [],
  });
}

export class BlockBuilder implements SpecBuilder<BlockSpec> {
  constructor(private readonly spec: BlockSpec = { kind: "block", components: [] }) {}

  add(value: ComponentInput): BlockBuilder {
    return new BlockBuilder({
      ...this.spec,
      components: [...this.spec.components, componentSpec(value)],
    });
  }

  toSpec(): BlockSpec {
    return clone(this.spec);
  }
}

export function block(): BlockBuilder {
  return new BlockBuilder();
}

export class CardBuilder implements SpecBuilder<CardSpec> {
  constructor(
    private readonly spec: CardSpec = {
      specVersion: 1,
      kind: "card",
      blocks: [],
    },
  ) {}

  cardKey(value: string): CardBuilder {
    return new CardBuilder({ ...this.spec, cardKey: value });
  }

  header(value: HeaderBuilder | HeaderSpec): CardBuilder {
    return new CardBuilder({ ...this.spec, header: unwrap(value) });
  }

  width(value: NonNullable<CardConfigSpec["widthMode"]>): CardBuilder {
    return this.withConfig({ widthMode: value });
  }

  enableForward(value = true): CardBuilder {
    return this.withConfig({ enableForward: value });
  }

  summary(value: string): CardBuilder {
    return this.withConfig({ summary: value });
  }

  streamingMode(value = true): CardBuilder {
    return this.withConfig({ streamingMode: value });
  }

  streaming(
    value: NonNullable<CardConfigSpec["streamingConfig"]> = {},
  ): CardBuilder {
    return this.withConfig({ streamingMode: true, streamingConfig: clone(value) });
  }

  textStyle(
    name: string,
    value: { default: string; pc?: string; mobile?: string },
  ): CardBuilder {
    return this.withConfig({
      textStyles: {
        ...(this.spec.config?.textStyles ?? {}),
        [name]: clone(value),
      },
    });
  }

  colorStyle(
    name: string,
    value: { lightMode: string; darkMode: string },
  ): CardBuilder {
    return this.withConfig({
      colorStyles: {
        ...(this.spec.config?.colorStyles ?? {}),
        [name]: clone(value),
      },
    });
  }

  bodyLayout(value: BodyLayoutSpec): CardBuilder {
    return new CardBuilder({ ...this.spec, body: clone(value) });
  }

  cardLink(value: string | CardLinkSpec): CardBuilder {
    const link = typeof value === "string" ? { url: value } : clone(value);
    return new CardBuilder({ ...this.spec, cardLink: link });
  }

  add(value: BlockBuilder | BlockSpec | ComponentInput): CardBuilder {
    const nextBlock = isBlock(value)
      ? unwrap(value)
      : { kind: "block" as const, components: [componentSpec(value as ComponentInput)] };
    return new CardBuilder({
      ...this.spec,
      blocks: [...this.spec.blocks, nextBlock],
    });
  }

  compile(options: CompileOptions = {}) {
    return compileCardSpec(this.spec, options);
  }

  buildOrThrow(options: CompileOptions = {}) {
    return buildOrThrowCardSpec(this.spec, options);
  }

  toSpec(): CardSpec {
    return clone(this.spec);
  }

  private withConfig(patch: Partial<CardConfigSpec>): CardBuilder {
    return new CardBuilder({
      ...this.spec,
      config: { updateMulti: true, ...this.spec.config, ...patch },
    });
  }
}

function isBlock(
  value: BlockBuilder | BlockSpec | ComponentInput,
): value is BlockBuilder | BlockSpec {
  if (value instanceof BlockBuilder) return true;
  if (typeof value !== "object" || value === null) return false;
  if ("kind" in value && value.kind === "block") return true;
  if ("toSpec" in value) {
    return (value as SpecBuilder<BlockSpec | ComponentSpec>).toSpec().kind === "block";
  }
  return false;
}

export function card(): CardBuilder {
  return new CardBuilder();
}
