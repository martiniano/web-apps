/*
 *
 * (c) Copyright Ascensio System Limited 2010-2018
 *
 * This program is a free software product. You can redistribute it and/or
 * modify it under the terms of the GNU Affero General Public License (AGPL)
 * version 3 as published by the Free Software Foundation. In accordance with
 * Section 7(a) of the GNU AGPL its Section 15 shall be amended to the effect
 * that Ascensio System SIA expressly excludes the warranty of non-infringement
 * of any third-party rights.
 *
 * This program is distributed WITHOUT ANY WARRANTY; without even the implied
 * warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR  PURPOSE. For
 * details, see the GNU AGPL at: http://www.gnu.org/licenses/agpl-3.0.html
 *
 * You can contact Ascensio System SIA at Lubanas st. 125a-25, Riga, Latvia,
 * EU, LV-1021.
 *
 * The  interactive user interfaces in modified source and object code versions
 * of the Program must display Appropriate Legal Notices, as required under
 * Section 5 of the GNU AGPL version 3.
 *
 * Pursuant to Section 7(b) of the License you must retain the original Product
 * logo when distributing the program. Pursuant to Section 7(e) we decline to
 * grant you any rights under trademark law for use of our trademarks.
 *
 * All the Product's GUI elements, including illustrations and icon sets, as
 * well as technical writing content are licensed under the terms of the
 * Creative Commons Attribution-ShareAlike 4.0 International. See the License
 * terms at http://creativecommons.org/licenses/by-sa/4.0/legalcode
 *
*/
/**
 *  AtalhoSettingsDialog.js
 *
 *  Created by Alexander Yuzhin on 2/20/14
 *  Copyright (c) 2018 Ascensio System SIA. All rights reserved.
 *
 */


if (Common === undefined)
    var Common = {};

define([
    'common/main/lib/util/utils',
    'common/main/lib/component/InputField',
    'common/main/lib/component/Window'
], function () { 'use strict';

    DE.Views.AtalhoSettingsDialog = Common.UI.Window.extend(_.extend({
        options: {
            width: 350,
            style: 'min-width: 230px;',
            cls: 'modal-dlg'
        },

        initialize : function(options) {
            _.extend(this.options, {
                title: this.textTitle
            }, options || {});

            this.template = [
                '<div class="box">',
                    '<div class="input-row">',
                        '<label>' + this.textSigla + ' *</label>',
                    '</div>',
                    '<div id="id-dlg-atalho-sigla" class="input-row" style="margin-bottom: 5px;"></div>',
                    '<div class="input-row">',
                        '<label>' + this.textNome + ' *</label>',
                    '</div>',
                    '<div id="id-dlg-atalho-nome" class="input-row" style="margin-bottom: 5px;"></div>',
                    '<div class="input-row">',
                        '<label>' + this.textAtalhoText + ' *</label>',
                    '</div>',
                    '<div id="id-dlg-atalho-atalho-texto" class="input-row" style="margin-bottom: 5px;"></div>',

                    '<label class="header">' + this.textCategoria + ' *</label>',
                    '<div id="id-categoria-combo" class="input-group-nr" style="margin-bottom:15px;"></div>',
                '</div>',
                '<div class="footer right">',
                    '<button class="btn normal dlg-btn primary" result="ok" style="margin-right: 10px;">' + this.okButtonText + '</button>',
                    '<button class="btn normal dlg-btn" result="cancel">' + this.cancelButtonText + '</button>',
                '</div>'
            ].join('');

            this.options.tpl = _.template(this.template)(this.options);
            this.api = this.options.api;

            Common.UI.Window.prototype.initialize.call(this, this.options);
        },

        prependSpaces: function(str, len){
            return (new Array(len).join(' ') + str);
        },

        render: function() {
            Common.UI.Window.prototype.render.call(this);

            var me = this,
                $window = this.getChild();

            me.inputSigla = new Common.UI.InputField({
                el          : $('#id-dlg-atalho-sigla'),
                allowBlank  : false,
                blankError  : me.txtEmpty,
                style       : 'width: 100%;',
                maxLength   : 7,
                value       : '#',
                validateOnBlur: false
            });

            me.inputNome = new Common.UI.InputField({
                el          : $('#id-dlg-atalho-nome'),
                allowBlank  : false,
                blankError  : me.txtEmpty,
                style       : 'width: 100%;',
                maxLength   : 64,
                validateOnBlur: false
            });

            me.inputAtalhoTexto = new Common.UI.InputField({
                el          : $('#id-dlg-atalho-atalho-texto'),
                allowBlank  : false,
                blankError  : me.txtEmpty,
                validateOnBlur: false,
                style       : 'width: 100%;'
            }).on('changed:after', function() {
                me.isTextChanged = true;
            });

            var listItems = [];

            for(var index in me.options.categoriasDeAtalho) { 
                if (me.options.categoriasDeAtalho.hasOwnProperty(index)) {
                    var cat = me.options.categoriasDeAtalho[index];
                    listItems.push({
                        value: index,
                        displayValue: cat
                    });
                }
             }

            me.cmbCategoria = new Common.UI.ComboBox({
                el: $('#id-categoria-combo', this.$window),
                menuStyle: 'min-width: 218px; max-height: 200px;',
                cls: 'input-group-nr',
                menuCls: 'scrollable-menu',
                data: listItems,
                editable: false
            });

            $window.find('.dlg-btn').on('click', _.bind(this.onBtnClick, this));
            $window.find('input').on('keypress', _.bind(this.onKeyPress, this));
        },

        show: function() {
            Common.UI.Window.prototype.show.apply(this, arguments);

            var me = this;
            _.delay(function(){
                me.inputSigla.cmpEl.find('input').focus();
            },500);
        },

        setSettings: function (selectedText) {
            if (selectedText) {
                var me = this;

                me.inputAtalhoTexto.setValue(selectedText);
                me.inputAtalhoTexto.setDisabled(false);

                this.isTextChanged = false;
            }
        },

        getSettings: function () {
            var me      = this,
            props     = {};

            props.sigla = $.trim(me.inputSigla.getValue());
            props.nome = $.trim(me.inputNome.getValue());;
            props.atalho_texto = $.trim(me.inputAtalhoTexto.getValue());
            props.categoria = $.trim(me.cmbCategoria.getValue());

            return props;
        },

        onBtnClick: function(event) {
            this._handleInput(event.currentTarget.attributes['result'].value);
        },

        onKeyPress: function(event) {
            if (event.keyCode == Common.UI.Keys.RETURN) {
                this._handleInput('ok');
                return false;
            }
        },

        _handleInput: function(state) {
            if (this.options.handler) {
                if (state == 'ok') {
                    var checkSigla = this.inputSigla.checkValidate(),
                        checkAtalhoTexto = this.inputAtalhoTexto.checkValidate(),
                        checkAtalhoNome= this.inputNome.checkValidate(),
                        cmbSelectedRecord = this.cmbCategoria.getSelectedRecord();

                    if (checkSigla !== true)  {
                        this.inputSigla.cmpEl.find('input').focus();
                        return;
                    }
                    if (checkAtalhoTexto !== true) {
                        this.inputAtalhoTexto.cmpEl.find('input').focus();
                        return;
                    }
                    if (checkAtalhoNome !== true) {
                        this.checkAtalhoNome.cmpEl.find('input').focus();
                        return;
                    }
                    
                    if (cmbSelectedRecord === null) {
                        this.cmbCategoria.cmpEl.find('input').focus();
                        return;
                    }
                }

                this.options.handler.call(this, this, state);
            }

            this.close();
        },

        textSigla:          'Sigla',
        textAtalhoText:     'Texto do atalho',
        cancelButtonText:   'Cancelar',
        okButtonText:       'Ok',
        txtEmpty:           'Este campo é obrigatório',
        textCategoria:      'Categoria',
        textNome:           'Nome',
        textTitle:          'Adicionar Atalho'
    }, DE.Views.AtalhoSettingsDialog || {}))
});