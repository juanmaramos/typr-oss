/**
 * ProseMirror Document Diffing Algorithm
 * Adapted from Saru: https://github.com/jmiran15/saru
 * Original: https://github.com/hamflx/prosemirror-diff
 *
 * Creates word-level diffs between two ProseMirror documents
 * and marks changes with diffMark for visual highlighting
 */

import * as DiffMatchPatch from "diff-match-patch";
const diff_match_patch = DiffMatchPatch.diff_match_patch;
import { Fragment, Node as ProsemirrorNode, Schema } from "prosemirror-model";

export const DiffType = {
  Unchanged: 0,
  Deleted: -1,
  Inserted: 1,
} as const;

export type DiffTypeValue = typeof DiffType[keyof typeof DiffType];

export const patchDocumentNode = (
  schema: Schema,
  oldNode: ProsemirrorNode,
  newNode: ProsemirrorNode,
): ProsemirrorNode => {
  assertNodeTypeEqual(oldNode, newNode);

  const finalLeftChildren: ProsemirrorNode[] = [];
  const finalRightChildren: ProsemirrorNode[] = [];

  const oldChildren = normalizeNodeContent(oldNode);
  const newChildren = normalizeNodeContent(newNode);
  const oldChildLen = oldChildren.length;
  const newChildLen = newChildren.length;
  const minChildLen = Math.min(oldChildLen, newChildLen);

  let left = 0;
  let right = 0;

  for (; left < minChildLen; left++) {
    const oldChild = oldChildren[left];
    const newChild = newChildren[left];
    if (!isNodeEqual(oldChild, newChild)) {
      break;
    }
    const oldChildArray = ensureArray(oldChild);
    finalLeftChildren.push(...oldChildArray);
  }

  for (; right + left + 1 < minChildLen; right++) {
    const oldChild = oldChildren[oldChildLen - right - 1];
    const newChild = newChildren[newChildLen - right - 1];
    if (!isNodeEqual(oldChild, newChild)) {
      break;
    }
    const oldChildArray = ensureArray(oldChild);
    finalRightChildren.unshift(...oldChildArray);
  }

  const diffOldChildren = oldChildren.slice(left, oldChildLen - right);
  const diffNewChildren = newChildren.slice(left, newChildLen - right);

  if (diffOldChildren.length && diffNewChildren.length) {
    const matchedNodes = matchNodes(schema, diffOldChildren, diffNewChildren).sort(
      (a, b) => b.count - a.count,
    );
    const bestMatch = matchedNodes[0];
    if (bestMatch) {
      const { oldStartIndex, newStartIndex, oldEndIndex, newEndIndex } = bestMatch;
      const oldBeforeMatchChildren = diffOldChildren.slice(0, oldStartIndex);
      const newBeforeMatchChildren = diffNewChildren.slice(0, newStartIndex);

      finalLeftChildren.push(
        ...patchRemainNodes(schema, oldBeforeMatchChildren, newBeforeMatchChildren),
      );
      const matchedChildren = diffOldChildren.slice(oldStartIndex, oldEndIndex).flatMap(ensureArray);
      finalLeftChildren.push(...matchedChildren);

      const oldAfterMatchChildren = diffOldChildren.slice(oldEndIndex);
      const newAfterMatchChildren = diffNewChildren.slice(newEndIndex);

      finalRightChildren.unshift(
        ...patchRemainNodes(schema, oldAfterMatchChildren, newAfterMatchChildren),
      );
    } else {
      finalLeftChildren.push(...patchRemainNodes(schema, diffOldChildren, diffNewChildren));
    }
  } else {
    finalLeftChildren.push(...patchRemainNodes(schema, diffOldChildren, diffNewChildren));
  }

  return createNewNode(oldNode, [...finalLeftChildren, ...finalRightChildren]);
};

const matchNodes = (
  schema: Schema,
  oldChildren: Array<ProsemirrorNode | ProsemirrorNode[]>,
  newChildren: Array<ProsemirrorNode | ProsemirrorNode[]>,
) => {
  const matches: Array<{
    oldStartIndex: number;
    newStartIndex: number;
    oldEndIndex: number;
    newEndIndex: number;
    count: number;
  }> = [];

  for (let oldStartIndex = 0; oldStartIndex < oldChildren.length; oldStartIndex++) {
    const oldStartNode = oldChildren[oldStartIndex];
    const newStartIndex = findMatchNode(newChildren, oldStartNode);

    if (newStartIndex !== -1) {
      let oldEndIndex = oldStartIndex + 1;
      let newEndIndex = newStartIndex + 1;
      for (
        ;
        oldEndIndex < oldChildren.length && newEndIndex < newChildren.length;
        oldEndIndex++, newEndIndex++
      ) {
        const oldEndNode = oldChildren[oldEndIndex];
        if (!isNodeEqual(newChildren[newEndIndex], oldEndNode)) {
          break;
        }
      }
      matches.push({
        oldStartIndex,
        newStartIndex,
        oldEndIndex,
        newEndIndex,
        count: newEndIndex - newStartIndex,
      });
    }
  }
  return matches;
};

const findMatchNode = (
  children: Array<ProsemirrorNode | ProsemirrorNode[]>,
  node: ProsemirrorNode | ProsemirrorNode[],
  startIndex = 0,
): number => {
  for (let i = startIndex; i < children.length; i++) {
    if (isNodeEqual(children[i], node)) {
      return i;
    }
  }
  return -1;
};

const patchRemainNodes = (
  schema: Schema,
  oldChildren: Array<ProsemirrorNode | ProsemirrorNode[]>,
  newChildren: Array<ProsemirrorNode | ProsemirrorNode[]>,
): ProsemirrorNode[] => {
  const finalLeftChildren: ProsemirrorNode[] = [];
  const finalRightChildren: ProsemirrorNode[] = [];
  const oldChildLen = oldChildren.length;
  const newChildLen = newChildren.length;
  let left = 0;
  let right = 0;

  while (oldChildLen - left - right > 0 && newChildLen - left - right > 0) {
    const leftOldNode = oldChildren[left];
    const leftNewNode = newChildren[left];
    const rightOldNode = oldChildren[oldChildLen - right - 1];
    const rightNewNode = newChildren[newChildLen - right - 1];
    let updateLeft = !isTextNode(leftOldNode) && matchNodeType(leftOldNode, leftNewNode);
    let updateRight = !isTextNode(rightOldNode) && matchNodeType(rightOldNode, rightNewNode);

    if (Array.isArray(leftOldNode) && Array.isArray(leftNewNode)) {
      finalLeftChildren.push(...patchTextNodes(schema, leftOldNode, leftNewNode));
      left += 1;
      continue;
    }

    if (updateLeft && updateRight) {
      const equalityLeft = computeChildEqualityFactor(leftOldNode, leftNewNode);
      const equalityRight = computeChildEqualityFactor(rightOldNode, rightNewNode);
      if (equalityLeft < equalityRight) {
        updateLeft = false;
      } else {
        updateRight = false;
      }
    }

    if (updateLeft) {
      finalLeftChildren.push(
        patchDocumentNode(schema, leftOldNode as ProsemirrorNode, leftNewNode as ProsemirrorNode),
      );
      left += 1;
    } else if (updateRight) {
      finalRightChildren.unshift(
        patchDocumentNode(schema, rightOldNode as ProsemirrorNode, rightNewNode as ProsemirrorNode),
      );
      right += 1;
    } else {
      // Delete and insert
      const deletedNodes = ensureArray(createDiffNode(schema, leftOldNode, DiffType.Deleted));
      const insertedNodes = ensureArray(createDiffNode(schema, leftNewNode, DiffType.Inserted));
      finalLeftChildren.push(...deletedNodes);
      finalLeftChildren.push(...insertedNodes);
      left += 1;
    }
  }

  const deleteNodeLen = oldChildLen - left - right;
  const insertNodeLen = newChildLen - left - right;

  if (deleteNodeLen) {
    const deletedNodes = oldChildren
      .slice(left, left + deleteNodeLen)
      .flatMap(ensureArray)
      .flatMap((node) => ensureArray(createDiffNode(schema, node, DiffType.Deleted)));
    finalLeftChildren.push(...deletedNodes);
  }

  if (insertNodeLen) {
    const insertedNodes = newChildren
      .slice(left, left + insertNodeLen)
      .flatMap(ensureArray)
      .flatMap((node) => ensureArray(createDiffNode(schema, node, DiffType.Inserted)));
    finalRightChildren.unshift(...insertedNodes);
  }

  return [...finalLeftChildren, ...finalRightChildren];
};

/**
 * Perform word-level diffs on text nodes
 */
export const patchTextNodes = (
  schema: Schema,
  oldNodes: ProsemirrorNode[],
  newNodes: ProsemirrorNode[],
): ProsemirrorNode[] => {
  const dmp = new diff_match_patch();

  // Join text from contiguous text nodes
  const oldText = oldNodes.map((n) => getNodeText(n)).join("");
  const newText = newNodes.map((n) => getNodeText(n)).join("");

  // Tokenize into words including whitespace for accurate reconstruction
  const oldTokens = tokenizeWords(oldText);
  const newTokens = tokenizeWords(newText);

  // Convert tokens to unique chars for diff-match-patch
  const { chars1, chars2, tokenArray } = tokensToChars(oldTokens, newTokens);

  // Calculate diff and cleanup semantically
  let diffs = dmp.diff_main(chars1, chars2, false);
  dmp.diff_cleanupSemantic(diffs);

  // Map back from char sequences to original tokens
  type DiffWithTokens = [number, string[]];
  const diffsWithTokens: DiffWithTokens[] = diffs.map(([type, text]) => {
    const tokens = text.split("").map((ch) => tokenArray[ch.charCodeAt(0)]);
    return [type, tokens];
  });

  // Convert token-level diffs to ProseMirror text nodes with diffMark
  const res = diffsWithTokens.flatMap(([type, tokens]) => {
    return tokens.map((token) =>
      createTextNode(
        schema,
        token,
        type !== DiffType.Unchanged ? [createDiffMark(schema, type as DiffTypeValue)] : [],
      )
    );
  });

  return res;
};

/**
 * Word-level tokenizer that preserves whitespace and punctuation
 */
const tokenizeWords = (text: string): string[] => {
  return text.split(/(\s+|[^\w\s]+)/g).filter((t) => t.length > 0);
};

/**
 * Map tokens to unique chars for diff-match-patch
 */
const tokensToChars = (
  oldTokens: string[],
  newTokens: string[],
): { chars1: string; chars2: string; tokenArray: string[] } => {
  const tokenArray: string[] = [];
  const tokenHash: Record<string, number> = {};
  let tokenStart = 0;

  const encode = (tokens: string[]) =>
    tokens
      .map((tok) => {
        if (tok in tokenHash) {
          return String.fromCharCode(tokenHash[tok]);
        }
        tokenHash[tok] = tokenStart;
        tokenArray[tokenStart] = tok;
        return String.fromCharCode(tokenStart++);
      })
      .join("");

  const chars1 = encode(oldTokens);
  const chars2 = encode(newTokens);

  return { chars1, chars2, tokenArray };
};

export const computeChildEqualityFactor = (
  node1: ProsemirrorNode | ProsemirrorNode[],
  node2: ProsemirrorNode | ProsemirrorNode[],
): number => {
  return 0;
};

export const assertNodeTypeEqual = (node1: ProsemirrorNode, node2: ProsemirrorNode): void => {
  if (node1.type.name !== node2.type.name) {
    throw new Error(`node type not equal: ${node1.type.name} !== ${node2.type.name}`);
  }
};

export const ensureArray = <T>(value: T | T[]): T[] => {
  return Array.isArray(value) ? value : [value];
};

/**
 * Compare two ProseMirror marks for equality
 */
export const isMarkEqual = (mark1: any, mark2: any): boolean => {
  if (!mark1 || !mark2) {
    return mark1 === mark2;
  }

  // Compare mark type
  if (mark1.type?.name !== mark2.type?.name) {
    return false;
  }

  // Compare mark attributes
  const attrs1 = mark1.attrs || {};
  const attrs2 = mark2.attrs || {};
  const attrKeys = [...new Set([...Object.keys(attrs1), ...Object.keys(attrs2)])];

  for (const key of attrKeys) {
    if (attrs1[key] !== attrs2[key]) {
      return false;
    }
  }

  return true;
};

export const isNodeEqual = (
  node1: ProsemirrorNode | ProsemirrorNode[],
  node2: ProsemirrorNode | ProsemirrorNode[],
): boolean => {
  const isNode1Array = Array.isArray(node1);
  const isNode2Array = Array.isArray(node2);

  if (isNode1Array !== isNode2Array) {
    return false;
  }

  if (isNode1Array && isNode2Array) {
    return (
      node1.length === node2.length && node1.every((n, i) => isNodeEqual(n, node2[i]))
    );
  }

  if (!isNode1Array && !isNode2Array) {
    const n1 = node1 as ProsemirrorNode;
    const n2 = node2 as ProsemirrorNode;

    if (n1.type.name !== n2.type.name) {
      return false;
    }

    if (isTextNode(n1)) {
      if (n1.text !== n2.text) {
        return false;
      }
    }

    // Check attributes
    const attrs = [...new Set([...Object.keys(n1.attrs), ...Object.keys(n2.attrs)])];
    for (const attr of attrs) {
      if (n1.attrs[attr] !== n2.attrs[attr]) {
        return false;
      }
    }

    // Check marks (with safety checks)
    const marks1 = n1.marks || [];
    const marks2 = n2.marks || [];
    if (marks1.length !== marks2.length) {
      return false;
    }
    for (let i = 0; i < marks1.length; i++) {
      // Marks are not nodes - compare them properly
      if (!isMarkEqual(marks1[i], marks2[i])) {
        return false;
      }
    }

    // Check children
    const children1 = n1.content?.content || [];
    const children2 = n2.content?.content || [];
    if (children1.length !== children2.length) {
      return false;
    }
    for (let i = 0; i < children1.length; i++) {
      if (!isNodeEqual(children1[i], children2[i])) {
        return false;
      }
    }

    return true;
  }

  return false;
};

export const normalizeNodeContent = (
  node: ProsemirrorNode,
): Array<ProsemirrorNode | ProsemirrorNode[]> => {
  const content = node.content?.content || [];
  const res: Array<ProsemirrorNode | ProsemirrorNode[]> = [];

  for (let i = 0; i < content.length; i++) {
    const child = content[i];
    if (isTextNode(child)) {
      const textNodes: ProsemirrorNode[] = [];
      for (
        let textNode = content[i];
        i < content.length && isTextNode(textNode);
        textNode = content[++i]
      ) {
        textNodes.push(textNode);
      }
      i--;
      res.push(textNodes);
    } else {
      res.push(child);
    }
  }
  return res;
};

export const getNodeText = (node: ProsemirrorNode): string => node.text || "";

export const isTextNode = (node: ProsemirrorNode | ProsemirrorNode[]): boolean => {
  if (Array.isArray(node)) {
    return false;
  }
  return node.type.name === "text";
};

export const matchNodeType = (
  node1: ProsemirrorNode | ProsemirrorNode[],
  node2: ProsemirrorNode | ProsemirrorNode[],
): boolean => {
  if (Array.isArray(node1) && Array.isArray(node2)) {
    return true;
  }
  if (Array.isArray(node1) || Array.isArray(node2)) {
    return false;
  }
  return node1.type.name === node2.type.name;
};

export const createNewNode = (
  oldNode: ProsemirrorNode,
  children: ProsemirrorNode[],
): ProsemirrorNode => {
  if (!oldNode.type) {
    throw new Error("oldNode.type is undefined");
  }
  return oldNode.type.create(
    oldNode.attrs,
    Fragment.fromArray(children),
    oldNode.marks,
  );
};

export const createDiffNode = (
  schema: Schema,
  node: ProsemirrorNode | ProsemirrorNode[],
  type: DiffTypeValue,
): ProsemirrorNode | ProsemirrorNode[] => {
  return mapDocumentNode(node, (node) => {
    if (isTextNode(node)) {
      return createTextNode(schema, getNodeText(node), [
        ...(node.marks || []),
        createDiffMark(schema, type),
      ]);
    }
    return node;
  });
};

function mapDocumentNode(
  node: ProsemirrorNode | ProsemirrorNode[],
  mapper: (node: ProsemirrorNode) => ProsemirrorNode | null,
): ProsemirrorNode | ProsemirrorNode[] {
  if (Array.isArray(node)) {
    return node.map((n) => mapDocumentNode(n, mapper) as ProsemirrorNode).filter((n) => n);
  }

  const mappedChildren = (node.content?.content || [])
    .map((child) => mapDocumentNode(child, mapper))
    .filter((n) => n)
    .flatMap(ensureArray);

  const copy = node.copy(Fragment.from(mappedChildren));
  return mapper(copy) || copy;
}

export const createDiffMark = (schema: Schema, type: DiffTypeValue) => {
  return schema.mark("diffMark", { type });
};

export const createTextNode = (schema: Schema, content: string, marks: any[] = []) => {
  return schema.text(content, marks);
};

/**
 * Main diff function - compares two documents and returns a diffed document
 */
export const diffEditor = (schema: Schema, oldDoc: any, newDoc: any): ProsemirrorNode => {
  const oldNode = ProsemirrorNode.fromJSON(schema, oldDoc);
  const newNode = ProsemirrorNode.fromJSON(schema, newDoc);

  console.log("[diffEditor] Starting diff...");
  console.log("[diffEditor] Old node:", oldNode.type.name, "children:", oldNode.childCount);
  console.log("[diffEditor] New node:", newNode.type.name, "children:", newNode.childCount);

  const result = patchDocumentNode(schema, oldNode, newNode);

  // Count diff marks in result
  let diffMarkCount = 0;
  result.descendants((node) => {
    if (node.marks?.some(mark => mark.type.name === "diffMark")) {
      diffMarkCount++;
      console.log("[diffEditor] Found diff mark on node:", node.type.name, node.text?.substring(0, 50));
    }
  });

  console.log("[diffEditor] Result has", diffMarkCount, "nodes with diff marks");

  return result;
};
