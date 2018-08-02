/**
 *    Nuclearis.js
 *
 *    Created by Anderson Martiniano on 24 July 2018
 *    Copyright (c) 2018 Nuclearis LTDA. All rights reserved.
 *
 */

define([
    'jquery',
    'underscore',
    'backbone',
    'gateway',
    'documenteditor/main/custom/AtalhoSettingsDialog',
], function ($, _, Backbone, gateway) {
    Common.Nuclearis = new (function() {
        var _guidConstrutorDeLaudo = "asc.{A8705DEE-7544-4C33-B3D5-168406D92F72}";
        var _guidNuclearisMacros = "asc.{6C5EFDEE-127E-11E8-B642-0ED5F89F718B}";
        var _mainController = null;
        var _buffer = {startPos: null, endPos: null, text: ''};
        var _itensBuffer = [];
        var _atalhoAutoCompleteMenu = null;
        var _renderMenu = true;
        var _atalhos = null;
        var _categoriasDeAtalho = null;

        var me = this;

        var onInternalCommand = function(data) {
            //console.log(data);
            
            //Force Save
            if(data != null && data.command == 'forceSave'){
                window.AscDesktopEditor_Save();
            }
        };

        var onInit = function(loadConfig) {
        
            //console.log(loadConfig);

            if(_mainController == null){
                try { _mainController = DE.getController('Main'); } catch(e) {
                    try { _mainController = PE.getController('Main'); } catch(e) {
                        try { _mainController =  SSE.getController('Main'); } catch(e) {}
                    }
                }
            }

            var application = _mainController.getApplication();
            var documentHolderView =  application.getController('DocumentHolder').getView('DocumentHolder');

            var menuAddShortcutPara = new Common.UI.MenuItem({
                caption     : 'Adicionar Atalho'
            }).on('click', _.bind(adicionarAtalhoDialog, me));

            menuAddShortcutPara.setVisible(true);

            _mainController.api.asc_registerCallback('asc_onContextMenu', function(){
                
                var selectedElements =  _mainController.api.getSelectedElements();
                var menu_item_props = getMenuItemProps(selectedElements);

                menuAddShortcutPara.menu_item_props = menu_item_props;

                menuAddShortcutPara.menu_item_props.selectedText = _mainController.api.WordControl.m_oLogicDocument.GetSelectedText(true);

                if(menu_item_props.hasSpellCheck && !menu_item_props.spellProps.value.Checked){
                    documentHolderView.textMenu.insertItem(-1, menuAddShortcutPara);
                }else{
                    documentHolderView.textMenu.insertItem(0, menuAddShortcutPara);
                }          
            });

            _atalhoAutoCompleteMenu = new Common.UI.Menu({
                items: [ ]
            }).on('item:click', function (menu, item, e) {
                replaceAtalho(item.value, _atalhos[item.value]);
            });

            if(_mainController && _mainController.editorConfig && _mainController.editorConfig.atalhos){
                _atalhos = _mainController.editorConfig.atalhos;		
            }

            //Habilita plugin construtor de laudo ao se fechar qualquer outro plugin
            if(!_mainController.api.asc_checkNeedCallback('asc_onPluginClose')){
                _mainController.api.asc_registerCallback('asc_onPluginClose', function(plugin){
                    if(plugin.guid !== _guidConstrutorDeLaudo){					
                        startPluginConstrutorDeLaudo();
                    }
                });
            }
        };

        var handleDocumentKeyUp = function(event){
            if (_mainController.api){
                searchAtalho(event);
            }
        };

        var handleDocumentKeyDown = function(event){
            if (_mainController.api){
                //var key = event.keyCode;

                if(_atalhos == null){
                    if(_mainController && _mainController.editorConfig && _mainController.editorConfig.atalhos){
                        _atalhos = _mainController.editorConfig.atalhos;		
                    }
                } 
                
                _renderMenu = true;
                if(_atalhoAutoCompleteMenu.isVisible()){
                    //Top Arrow or Bottom Arrow
                    if(event.keyCode == Common.UI.Keys.UP || event.keyCode == Common.UI.Keys.DOWN){ 
                        event.preventDefault();
                        _atalhoAutoCompleteMenu.cmpEl.focus();
                         _atalhoAutoCompleteMenu.onAfterKeydownMenu(event);
                         _renderMenu = false;
                         return false;
                    }

                    //Esc
                    if(event.keyCode == Common.UI.Keys.ESC){
                        _atalhoAutoCompleteMenu.hide();
                        _renderMenu = false;
                        _itensBuffer = [];
                    }

                    //Enter
                    if(event.keyCode == Common.UI.Keys.RETURN){
                        _atalhoAutoCompleteMenu.hide();
                        _renderMenu = false;
                        _itensBuffer = [];
                    }
                }
            }
        };


        var showPopupMenu = function(documentHolderView, menu, value, event, docElement, eOpts){
            if (!_.isUndefined(menu)  && menu !== null){
                Common.UI.Menu.Manager.hideAll();

                var showPoint = [event.X_abs, event.Y_abs],
                    menuContainer = $(documentHolderView.$el).find(Common.Utils.String.format('#menu-container-{0}', menu.id));

                if (!menu.rendered) {
                    // Prepare menu container
                    if (menuContainer.length < 1) {
                        menuContainer = $(Common.Utils.String.format('<div id="menu-container-{0}" style="position: absolute; z-index: 10000;"><div class="dropdown-toggle" data-toggle="dropdown"></div></div>', menu.id));
                        $(documentHolderView.$el).append(menuContainer);
                    }

                    menu.render(menuContainer);
                    menu.cmpEl.attr({tabindex: "-1"});
                }

                menuContainer.css({
                    left: showPoint[0],
                    top : showPoint[1]
                });

                menu.show();

                if (_.isFunction(menu.options.initMenu)) {
                    menu.options.initMenu(value);
                    menu.alignPosition();
                }

                _.delay(function() {
                    menu.cmpEl.focus();
                }, 10);

                menu.items.forEach(function(item){
                    var modalParents = item.cmpEl.closest("div[id^='menu-container-asc']");

                    item.cmpEl.tooltip({
                        title       : _atalhos[item.value],
                        placement   : 'bottom-left'
                    });

                    if (modalParents.length > 0) {
                        item.cmpEl.data('bs.tooltip').tip().css('z-index', parseInt(modalParents.css('z-index')) + 10);
                    }
                });

                documentHolderView.currentMenu = menu;
            }
        };

        var exibirMenuPopupAtalhos = function(itens){
            var curPosXY = _mainController.api.WordControl.m_oLogicDocument.GetCurPosXY();
            var PageIndex = _mainController.api.WordControl.m_oLogicDocument.Controller.GetCurPage();
            var ConvertedPos = _mainController.api.WordControl.m_oDrawingDocument.ConvertCoordsToCursorWR(curPosXY.X, curPosXY.Y, PageIndex);
            
            var menuData = {Type: 0, X_abs: ConvertedPos.X, Y_abs: ConvertedPos.Y};

            _atalhoAutoCompleteMenu.removeAll();
            for(var i = 0; i < itens.length ;i++){
                var menuItemAtalho = new Common.UI.MenuItem({
                    caption: Common.Utils.String.ellipsis(itens[i] + ' - ' + _atalhos[itens[i]], 80, true),
                    value: itens[i],
                });

                _atalhoAutoCompleteMenu.addItem(menuItemAtalho);
            }

            var application = _mainController.getApplication();
            var documentHolderView =  application.getController('DocumentHolder').getView('DocumentHolder');

            showPopupMenu(documentHolderView, _atalhoAutoCompleteMenu, {}, menuData, null, null);
        }

        var searchAtalho = function(e)
        {
            if (_renderMenu && _mainController.api){
                
                var Doc    = _mainController.api.WordControl.m_oLogicDocument;
        
                var paraRun = Doc.Get_DocumentPositionInfoForCollaborative();

                //var oRunText = new CParagraphGetText();
                //paraRun.Class.Get_Text(oRunText);
        
                if(paraRun.Class.Content && paraRun.Position >= 1){
                    var pos = paraRun.Position - 1;

                    if(paraRun.Class.Content[pos].Type == AscCommonWord.ParaSpace.prototype.Get_Type()){
                        _buffer.startPos = null;
                        _buffer.endPos = null;  
                        _buffer.text = '';          
                    }else{ 
                        _buffer.endPos = pos;
                        _buffer.text = '';
                        while(pos >= 0 && paraRun.Class.Content[pos].Type != null && paraRun.Class.Content[pos].Type == AscCommonWord.ParaText.prototype.Get_Type()){
                            _buffer.text = String.fromCharCode(paraRun.Class.Content[pos].Value) + _buffer.text;
                            _buffer.startPos = pos;
                            pos--;
                        }

                        if(_buffer.text.length > 1){
                            var itens = [];
                            for (var key in _atalhos) {
                                if (key.indexOf(_buffer.text) != -1) {
                                    itens.push(key);
                                }
                            }
                            

                            if(itens.length > 0){
                                if(!_.isEqual(itens, _itensBuffer)){
                                    //console.log('exibindo');
                                    _itensBuffer = itens;
                                    exibirMenuPopupAtalhos(itens);                                    
                                }
                            }else{
                                if(_atalhoAutoCompleteMenu.isVisible()){
                                    //console.log('ocultando');
                                    _atalhoAutoCompleteMenu.hide();
                                    _itensBuffer = [];
                                }
                            }
                        }
                    }
                }
            }
        };

        var replaceAtalho = function(atalho, atalho_value){
            if (_mainController.api){                
                var Doc    = _mainController.api.WordControl.m_oLogicDocument;
                var paraRun = Doc.Get_DocumentPositionInfoForCollaborative();

                if(_buffer.startPos < paraRun.Position && _buffer.endPos < paraRun.Position){
                    paraRun.Class.Selection.Use   = true;
                    paraRun.Class.Selection.Start = false;
                    paraRun.Class.Selection.Flag  = AscCommon.selectionflag_Common;
            
                    paraRun.Class.Selection.StartPos = _buffer.startPos;
                    paraRun.Class.Selection.EndPos   = _buffer.endPos;

                    //var selectedText = Doc.GetSelectedText();
                    
                    paraRun.Class.Remove_FromContent(_buffer.startPos, atalho.length, true);
                    paraRun.Class.AddText(atalho_value, _buffer.startPos);
                    paraRun.Class.Paragraph.Document_SetThisElementCurrent(true);
                    paraRun.Class.MoveCursorToEndPos(false);
                    paraRun.Class.State.ContentPos = (_buffer.startPos + atalho_value.length + 1);

                    paraRun.Class.RemoveSelection();

                    _mainController.api.WordControl.m_oLogicDocument.Recalculate();

                    _itensBuffer = [];
                }
            }
        };

        Common.Gateway.on('init', onInit);

        Common.Gateway.on('internalcommand', onInternalCommand);

        $(document).on('keyup', handleDocumentKeyUp);

        $(document).on('keydown', handleDocumentKeyDown);

        var adicionarAtalhoDialog = function(item, e, eOpt){
            var win;
            var application = _mainController.getApplication();
            var documentHolderView =  application.getController('DocumentHolder').getView('DocumentHolder');
            
            if(_categoriasDeAtalho == null){
                if(_mainController && _mainController.editorConfig && _mainController.editorConfig.categoriasDeAtalho){
                    _categoriasDeAtalho = _mainController.editorConfig.categoriasDeAtalho;		
                }
            }       
            
            if (_mainController.api){
                win = new DE.Views.AtalhoSettingsDialog({
                    api: _mainController.api,
                    handler: function(dlg, result) {
                        if (result == 'ok') {
                            var _props = dlg.getSettings();
                            Common.Gateway.metaChange({type: 'adicionarAtalho',props:  _props});
                            _atalhos[_props.sigla] = _props.atalho_texto; 
                        }
                        documentHolderView.fireEvent('editcomplete', documentHolderView);
                    },
                    categoriasDeAtalho: _categoriasDeAtalho
                });                

                win.show();
                win.setSettings(item.menu_item_props.selectedText);
            }
        };

        var getMenuItemProps = function(selectedElements) {
            if (!selectedElements || !_.isArray(selectedElements)) return;
            var menu_props = {};
            for (var i = 0; i <selectedElements.length; i++) {
                var elType = selectedElements[i].get_ObjectType();
                var elValue = selectedElements[i].get_ObjectValue();
                if (Asc.c_oAscTypeSelectElement.Paragraph == elType)
                {
                    menu_props.paraProps = {};
                    menu_props.paraProps.value = elValue;
                    menu_props.paraProps.locked = (elValue) ? elValue.get_Locked() : false;
                    noobject = false;
                } else if (Asc.c_oAscTypeSelectElement.SpellCheck == elType) {
                    menu_props.spellProps = {};
                    menu_props.spellProps.value = elValue;
                    menu_props.hasSpellCheck = true;
                }
            }
            return menu_props;
        };

        var _getAtalhos = function() {
            return _atalhos;
        };

        var startPluginConstrutorDeLaudo = function(){
            var plugin = window.g_asc_plugins.getPluginByGuid(_guidConstrutorDeLaudo);
            if (!plugin)
                return;
            var isRunned = (window.g_asc_plugins.runnedPluginsMap[_guidConstrutorDeLaudo] !== undefined) ? true : false;	
            if(!isRunned){
                
                var pluginData = new window.Asc.CPluginData();
                
                /*
			    if(mainController && mainController.editorConfig && mainController.editorConfig.macros){
                    pluginData.setAttribute("macros", mainController.editorConfig.macros);
                }
                
                if(mainController && mainController.editorConfig && typeof(mainController.editorConfig.laudoEstruturado) !== 'undefined') {
                    pluginData.setAttribute("laudoEstruturado", mainController.editorConfig.laudoEstruturado);
                }
                */
                
                window.g_asc_plugins.run(_guidConstrutorDeLaudo, 0, pluginData, true);
            }	
        }
        
        /*
        var _refresh = function() {
            if (!_lsAllowed)
                Common.Gateway.internalMessage('localstorage', {cmd:'get', keys:_filter});
        };

        var _save = function() {
            if (!_lsAllowed)
                Common.Gateway.internalMessage('localstorage', {cmd:'set', keys:_store});
        };

        var _setItem = function(name, value, just) {
            if (_lsAllowed) {
                try
                {
                    localStorage.setItem(name, value);
                }
                catch (error){}

            } else {
                _store[name] = value;

                if (just===true) {
                    Common.Gateway.internalMessage('localstorage', {
                        cmd:'set',
                        keys: {
                            name: value
                        }
                    });
                }
            }
        };

        try {
            var _lsAllowed = !!window.localStorage;
        } catch (e) {
            _lsAllowed = false;
        }
            */
        return {
            getAtalhos: _getAtalhos
        };
        
    })();
});