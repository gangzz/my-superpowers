import { SNAPSHOT_ID } from "./snapshot.js";

const OFFICIAL_LIMIT_VALUES = {
  componentsPerCard: 200,
  nestingDepth: 5,
  tablesPerCard: 5,
  tableColumns: 50,
  headerTags: 3,
  buttonTextChars: 100,
  inputPlaceholderChars: 100,
  inputMaxLength: 1000,
} as const;

export const OFFICIAL_LIMITS = {
  componentsPerCard: {
    value: OFFICIAL_LIMIT_VALUES.componentsPerCard,
    source: "structure",
    section: "卡片 JSON 2.0 结构限制",
    snapshot: SNAPSHOT_ID,
  },
  nestingDepth: {
    value: OFFICIAL_LIMIT_VALUES.nestingDepth,
    source: "form",
    section: "注意事项：容器类组件嵌套层数",
    snapshot: SNAPSHOT_ID,
  },
  tablesPerCard: {
    value: OFFICIAL_LIMIT_VALUES.tablesPerCard,
    source: "table",
    section: "注意事项：单卡表格数量",
    snapshot: SNAPSHOT_ID,
  },
  tableColumns: {
    value: OFFICIAL_LIMIT_VALUES.tableColumns,
    source: "table",
    section: "columns 字段说明",
    snapshot: SNAPSHOT_ID,
  },
  headerTags: {
    value: OFFICIAL_LIMIT_VALUES.headerTags,
    source: "title",
    section: "text_tag_list 字段说明",
    snapshot: SNAPSHOT_ID,
  },
  buttonTextChars: {
    value: OFFICIAL_LIMIT_VALUES.buttonTextChars,
    source: "button",
    section: "text.content 字段说明",
    snapshot: SNAPSHOT_ID,
  },
  inputPlaceholderChars: {
    value: OFFICIAL_LIMIT_VALUES.inputPlaceholderChars,
    source: "input",
    section: "placeholder.content 字段说明",
    snapshot: SNAPSHOT_ID,
  },
  inputMaxLength: {
    value: OFFICIAL_LIMIT_VALUES.inputMaxLength,
    source: "input",
    section: "max_length 字段说明",
    snapshot: SNAPSHOT_ID,
  },
} as const;

export const OFFICIAL_COMPONENT_LIMIT = OFFICIAL_LIMITS.componentsPerCard.value;
