<script>
import debounce from 'lodash/debounce';
import { typeOf } from '@/utils/sort';
import { _EDIT, _VIEW } from '@/config/query-params';
import { removeAt } from '@/utils/array';
import { asciiLike, escapeHtml } from '@/utils/string';
import { base64Encode, base64Decode } from '@/utils/crypto';
import { downloadFile } from '@/utils/download';
import TextAreaAutoGrow from '@/components/form/TextAreaAutoGrow';
import ClickExpand from '@/components/formatter/ClickExpand';
import { get } from '@/utils/object';
import CodeMirror from '@/components/CodeMirror';
import { mapGetters } from 'vuex';
import FileSelector from '@/components/form/FileSelector';
import { HIDE_SENSITIVE } from '@/store/prefs';

const LARGE_LIMIT = 2 * 1024;

export default {
  components: {
    TextAreaAutoGrow,
    ClickExpand,
    CodeMirror,
    FileSelector
  },

  props: {
    value: {
      type:     [Array, Object],
      default: null,
    },
    mode: {
      type:    String,
      default: _EDIT,
    },
    asMap: {
      type:    Boolean,
      default: true,
    },
    initialEmptyRow: {
      type:    Boolean,
      default: false,
    },

    title: {
      type:    String,
      default: ''
    },
    titleAdd: {
      type:    Boolean,
      default: false,
    },
    protip: {
      type:    [String, Boolean],
      default: 'ProTip: Paste lines of <code>key=value</code> or <code>key: value</code> into any key field for easy bulk entry',
    },

    padLeft: {
      type:    Boolean,
      default: false,
    },

    // For asMap=false, the name of the field that goes into the row objects
    keyName: {
      type:    String,
      default: 'key',
    },
    keyLabel: {
      type: String,
      default() {
        return this.$store.getters['i18n/t']('generic.key');
      },
    },
    keyPlaceholder: {
      type: String,
      default() {
        return this.$store.getters['i18n/t']('keyValue.valuePlaceholder');
      },
    },

    separatorLabel: {
      type:    String,
      default: '',
    },

    // For asMap=false, the name of the field that goes into the row objects
    valueName: {
      type:    String,
      default: 'value',
    },
    valueLabel: {
      type: String,
      default() {
        return this.$store.getters['i18n/t']('generic.value');
      },
    },
    valuePlaceholder: {
      type: String,
      default() {
        return this.$store.getters['i18n/t']('keyValue.valuePlaceholder');
      },
    },
    valueCanBeEmpty: {
      type:    Boolean,
      default: false,
    },
    valueBinary: {
      type:    Boolean,
      default: false,
    },
    valueMultiline: {
      type:    Boolean,
      default: true,
    },
    valueBase64: {
      type:    Boolean,
      default: false,
    },
    valueConcealed: {
      type:    Boolean,
      default: false,
    },

    addLabel: {
      type: String,
      default() {
        return this.$store.getters['i18n/t']('generic.add');
      },
    },
    addIcon: {
      type:    String,
      default: 'icon-plus',
    },
    addAllowed: {
      type:    Boolean,
      default: true,
    },

    readLabel: {
      type: String,
      default() {
        return this.$store.getters['i18n/t']('generic.readFromFile');
      },
    },
    readIcon: {
      type:    String,
      default: 'icon-upload',
    },
    readAllowed: {
      type:    Boolean,
      default: true,
    },
    readAccept: {
      type:    String,
      default: '*',
    },
    readMultiple: {
      type:    Boolean,
      default: false,
    },

    removeLabel: {
      type:    String,
      default: '',
    },
    removeIcon: {
      type:    String,
      default: 'icon-minus',
    },
    removeAllowed: {
      type:    Boolean,
      default: true,
    },
    fileModifier: {
      type:    Function,
      default: (name, value) => ({ name, value })
    },
    parserSeparators: {
      type:    Array,
      default: () => [': ', '='],
    },
  },

  data() {
    // @TODO base64 and binary support for as Array (!asMap)
    if ( !this.asMap ) {
      const rows = (this.value || []).slice() ;

      rows.map((row) => {
        row._display = this.displayProps(row[this.valueName]);
      });

      return { rows };
    }

    const input = this.value || {};
    const rows = [];

    Object.keys(input).forEach((key) => {
      let value = input[key];

      if ( this.valueBase64 ) {
        value = base64Decode(value);
      }
      rows.push({
        key,
        value,
        _display: this.displayProps(value)
      });
    });

    if ( !rows.length && this.initialEmptyRow && this.mode !== _VIEW ) {
      rows.push({ [this.keyName]: '', [this.valueName]: '' });
    }

    return { rows };
  },
  computed: {
    isView() {
      return this.mode === _VIEW;
    },

    hideSensitive() {
      return this.$store.getters['prefs/get'](HIDE_SENSITIVE);
    },

    showAdd() {
      return !this.isView && this.addAllowed;
    },

    showRead() {
      return !this.isView && this.readAllowed;
    },

    showRemove() {
      return !this.isView && this.removeAllowed;
    },

    threeColumns() {
      return this.showRemove;
    },

    hasSomeBinary() {
      return !!(this.rows.filter(row => !!get(row, '_display.binary')) || []).length;
    },

    largeLimit() {
      return LARGE_LIMIT;
    },

    ...mapGetters({ t: 'i18n/t' })
  },

  created() {
    this.queueUpdate = debounce(this.update, 500);
  },

  methods: {
    asciiLike,
    add(key = '', value = '') {
      this.rows.push({
        [this.keyName]:   key,
        [this.valueName]: value,
        _display:         this.displayProps(value)
      });
      this.queueUpdate();
      this.$nextTick(() => {
        const keys = this.$refs.key;
        const lastKey = keys[keys.length - 1];

        lastKey.focus();
      });
    },

    remove(idx) {
      removeAt(this.rows, idx);
      this.queueUpdate();
    },

    removeEmptyRows() {
      const cleaned = this.rows.filter((row) => {
        return (row.value.length || row.key.length);
      });

      this.$set(this, 'rows', cleaned);
    },

    onFileSelected(file) {
      const { name, value } = this.fileModifier(file.name, file.value);

      this.add(name, value, !asciiLike(value));
    },

    download(idx, ev) {
      const row = this.rows[idx];
      const name = row[this.keyName];
      const value = row[this.valueName];

      downloadFile(name, value, 'application/octet-stream');
    },

    update() {
      if ( this.isView ) {
        return;
      }

      if ( !this.asMap ) {
        this.$emit('input', this.rows.slice());

        return;
      }
      const out = {};
      const keyName = this.keyName;
      const valueName = this.valueName;

      if (!this.rows.length) {
        this.$emit('input', out);
      }
      for ( const row of this.rows ) {
        let value = (row[valueName] || '');
        const key = (row[keyName] || '').trim();

        if (value && typeOf(value) === 'object') {
          out[key] = JSON.parse(JSON.stringify(value));
        } else {
          value = (value || '').trim();

          if ( value && this.valueBase64 ) {
            value = base64Encode(value);
          }

          if ( key && (value || this.valueCanBeEmpty) ) {
            out[key] = value;
          }
        }
        this.$emit('input', out);
      }
    },

    displayProps(value) {
      const binary = typeof value === 'string' && !asciiLike(value);
      const withBreaks = escapeHtml(value || '').replace(/(\r\n|\r|\n)/g, '<br/>\n');
      const byteSize = (withBreaks.length || 0) * 2; // Blobs don't exist in node/ssr
      const isLarge = byteSize > LARGE_LIMIT;
      let parsed;

      if ( value && ( value.startsWith('{') || value.startsWith('[') ) ) {
        try {
          parsed = JSON.parse(value);
          parsed = JSON.stringify(parsed, null, 2);
        } catch {
        }
      }

      return {
        binary,
        withBreaks,
        isLarge,
        parsed,
        byteSize
      };
    },

    onPaste(index, event, pastedValue) {
      const text = event.clipboardData.getData('text/plain');
      const lines = text.split('\n');
      const splits = lines.map((line) => {
        if (line.includes(':')) {
          return line.split(':');
        }

        return line.split('=');
      });

      if (splits.length === 0 || (splits.length === 1 && splits[0].length < 2)) {
        return;
      }
      event.preventDefault();

      const keyValues = splits.map(split => ({
        [this.keyName]:   (split[0] || '').trim(),
        [this.valueName]: (split[1] || '').trim(),
        _display:         this.displayProps(split[1])
      }));

      this.rows.splice(index, 1, ...keyValues);
      this.queueUpdate();
    },

    get,

  }
};
</script>

<template>
  <div class="key-value" :class="mode">
    <div v-if="title" class="clearfix">
      <slot name="title">
        <h3>
          {{ title }}
          <button v-if="titleAdd && showAdd" type="button" class="btn btn-xs role-tertiary p-5 ml-10" style="position: relative; top: -3px;" @click="add()">
            <i class="icon icon-plus icon-lg icon-fw" />
          </button>
        </h3>
      </slot>
    </div>

    <div class="kv-container" :class="{'extra-column':threeColumns, 'view':isView}">
      <template v-if="rows.length || isView">
        <label class="text-label" :class="{'view':isView}">
          {{ keyLabel }}
          <i v-if="protip && !isView" v-tooltip="protip" class="icon icon-info" style="font-size: 14px" />
        </label>
        <label class="text-label" :class="{'view':isView}">
          {{ valueLabel }}
        </label>
        <span v-if="threeColumns" :class="{'view':isView}" />
      </template>

      <div v-if="isView && !rows.length" class="kv-row last" :class="{'extra-column':threeColumns}">
        <div class="text-muted">
          &mdash;
        </div>
        <div class="text-muted">
          &mdash;
        </div>
        <div v-if="threeColumns" class="text-muted">
          &mdash;
        </div>
      </div>

      <template v-for="(row,i) in rows">
        <div :key="i+'key'" class="kv-item key">
          <slot
            name="key"
            :row="row"
            :mode="mode"
            :keyName="keyName"
            :valueName="valueName"
            :isView="isView"
          >
            <div v-if="isView" class="view force-wrap">
              {{ row[keyName] }}
            </div>
            <input
              v-else
              ref="key"
              v-model="row[keyName]"
              :placeholder="keyPlaceholder"
              @input="queueUpdate"
              @paste="onPaste(i, $event)"
            />
          </slot>
        </div>

        <div :key="i+'value'" class="kv-item value">
          <slot
            name="value"
            :row="row"
            :mode="mode"
            :keyName="keyName"
            :valueName="valueName"
            :isView="isView"
            :queueUpdate="queueUpdate"
          >
            <div v-if="isView" class="view force-wrap">
              <span>
                <template v-if="get(row, '_display.parsed') && !hideSensitive">
                  <CodeMirror
                    :options="{mode:{name:'javascript', json:true}, lineNumbers:false, foldGutter:false, readOnly:true}"
                    :value="get(row, '_display.parsed')"
                    :class="{'conceal':valueConcealed && hideSensitive}"
                  />
                </template>
                <ClickExpand
                  v-else-if="row._display.binary || row._display.isLarge"
                  :value-binary="row._display.binary"
                  :max-length="largeLimit/2"
                  :value-concealed="!!valueConcealed && !!hideSensitive"
                  :value="row[valueName]"
                  :size="row._display.isLarge ? get(row, '_display.byteSize') : null"
                />
                <span v-else-if="get(row, '_display.withBreaks')" class="text-monospace" :class="{'conceal': hideSensitive}" v-html="get(row, '_display.withBreaks')" />
                <span v-else class="text-muted">&mdash;</span>
              </span>

              <template v-if="!!row[valueName]">
                <span v-if="row._display.binary" class="ml-10">
                  <a @click="download(i, $event)">Download</a>
                </span>
                <button v-else class="btn role-link copy-value" @click="$copyText(row[valueName])">
                  <i class="icon icon-copy" />
                </button>
              </template>
            </div>
            <TextAreaAutoGrow
              v-else-if="valueMultiline"
              v-model="row[valueName]"
              :placeholder="valuePlaceholder"
              :min-height="50"
              :spellcheck="false"
              @input="queueUpdate"
            />
            <input
              v-else
              v-model="row[valueName]"
              :placeholder="valuePlaceholder"
              autocorrect="off"
              autocapitalize="off"
              spellcheck="false"
              @input="queueUpdate"
            />
          </slot>
        </div>

        <div v-if="showRemove" :key="i" class="kv-item remove">
          <slot name="removeButton" :remove="remove" :row="row">
            <button type="button" class="btn bg-transparent role-link" @click="remove(i)">
              {{ removeLabel || t('generic.remove') }}
            </button>
          </slot>
        </div>
      </template>
    </div>

    <div v-if="!titleAdd && (showAdd || showRead)" class="footer">
      <slot name="add" :add="add">
        <button v-if="showAdd" type="button" class="btn btn-sm role-secondary add" @click="add()">
          {{ addLabel }}
        </button>
        <FileSelector v-if="showRead" class="btn-sm role-secondary" :label="t('generic.readFromFile')" :include-file-name="true" @selected="onFileSelected" />
      </slot>
    </div>
  </div>
</template>

<style lang="scss">

.key-value {
  width: 100%;

  .file-selector.role-link {
    text-transform: initial;
    padding: 0;
  }

  .kv-container{
    display: grid;
    align-items: center;
    grid-template-columns: auto 1fr;
    column-gap: $column-gutter;

    .view{
      overflow-wrap: break-word;
      word-wrap: break-word;
      -ms-word-break: break-all;
      word-break: break-word;
      display:flex;
      align-items:flex-start;
    }

    &.extra-column {
       grid-template-columns: 1fr 1fr 100px;
       &.view{
       grid-template-columns: auto 1fr 100px;

       }
    }

    & .kv-item {
      width: 100%;
      margin: 10px 0px 10px 0px;
      &.key {
        align-self: flex-start;
      }

      .text-monospace:not(.conceal) {
        font-family: monospace, monospace;
      }
    }

  }

  .remove {
    text-align: center;

    BUTTON{
      padding: 0px;
    }
  }

  .title {
    margin-bottom: 10px;

    .read-from-file {
      float: right;
    }
  }

  input {
    height: 50px;
  }

  .footer {

    .protip {
      float: right;
      padding: 5px 0;
    }
  }

  .download {
    text-align: right;
  }

  .copy-value{
    padding: 0px 0px 0px 10px;
  }

}
</style>
