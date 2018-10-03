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
        var _assinaturasPorLinha = 2;
        var _infoObj = {
            PageCount       : 0,
            WordsCount      : 0,
            ParagraphCount  : 0,
            SymbolsCount    : 0,
            SymbolsWSCount  : 0
        };

        var me = this;

        var onInternalCommand = function(objData) 
        {
            //console.log(objData);
            
            //Force Save
            if(objData != null && objData.command == 'forceSave')
            {
                window.AscDesktopEditor_Save();
            }

            //Inserir Assinatura
            if(objData != null && objData.command == 'inserirAssinatura')
            {
                //_mainController.api.asc_addSignatureLine('Anderson', 'fdafds','fdaffdaf dafda da','anderson martniano',30, 20, '');
                if(objData.data != null)
                {
                    //Verifica se assintura tem imagem, se sim, carrega a imagem antes de inserir assinatura
                    if(objData.data.imagem !== null && objData.data.imagem !== '')
                    {
                        urltoFile(objData.data.imagem, 'assinatura.png').then(function(file)
                        {
                            var Api             = window.g_asc_plugins.api;
                            var documentId      = Api.DocInfo.get_Id();
                            var documentUserId  = Api.DocInfo.get_UserId();
                            var jwt             = Api.CoAuthoringApi.get_jwt();

                            AscCommon.UploadImageFiles([file], documentId, documentUserId, jwt, function(error, urls)
                            {
                                if (Asc.c_oAscError.ID.No !== error)
                                {
                                    Api.sendEvent("asc_onError", error, Asc.c_oAscError.Level.NoCritical);
                                }
                                else
                                {
                                    objData.data.imagem = urls[0];

                                    if(Api.ImageLoader)
                                    {
                                        var oApi = Api;
                                        Api.ImageLoader.LoadImagesWithCallback(urls, function()
                                        {
                                            var aImages = [];
                                            for(var i = 0; i < urls.length; ++i){
                                                var _image = oApi.ImageLoader.LoadImage(urls[i], 1);
                                                if(_image){
                                                    aImages.push(_image);
                                                }
                                            }

                                            inserirAssinatura(objData.data);
                                        }, []);
                                    }
                                }
                            });
                        });
                    }
                    else
                    {
                        inserirAssinatura(objData.data);
                    }
                }
            }

            
            //getDocInfo
            if(objData != null && objData.command == 'getDocInfo')
            {
                window.g_asc_plugins.api.startGetDocInfo();
            }
        };

        //return a promise that resolves with a File instance
        var urltoFile = function(url, filename, mimeType){
            mimeType = mimeType || (url.match(/^data:([^;]+);/)||'')[1];
            return (fetch(url)
                .then(function(res){return res.arrayBuffer();})
                .then(function(buf){return new File([buf], filename, {type:mimeType});})
            );
        }

        var inserirBlockAssinatura = function(Api, oParagraph, data)
        {
            var extras = data.extras != null ? data.extras : [];
            var imageWidth = data.width != null ? data.width : 300;
            var imageHeight = data.height != null ? data.height : 200;
            
            if(data.imagem !== null && data.imagem !== ''){
                var oAssinatura = Api.CreateImage(data.imagem, imageWidth, imageHeight);
                oAssinatura.SetWrappingStyle('topAndBottom');
                oAssinatura.SetHorAlign("column", "center");
                oParagraph.AddDrawing(oAssinatura);
            }
            
            for(var i = 0; i < extras.length;i++){
                var oRun = Api.CreateRun();
                oRun.SetColor(0, 0, 0);
                oRun.AddText(extras[i]);
                if(i > 0){
                    oParagraph.AddLineBreak();
                }
                oParagraph.AddElement(oRun);
            }
                
            oParagraph.SetJc('center');
    
            return oParagraph;
        }

        var inserirAssinatura = function(data){
            var logicDocument =  _mainController.api.WordControl.m_oLogicDocument;
            var contentControls = _mainController.api.pluginMethod_GetAllContentControls();
            var Api = window.g_asc_plugins.api;

            if(_mainController && _mainController.editorConfig && _mainController.editorConfig.assinaturasPorLinha){
                _assinaturasPorLinha = _mainController.editorConfig.assinaturasPorLinha;		
            }else{
                _assinaturasPorLinha = 2;
            }

            var assinaturaContentControl = null;
            contentControls.forEach(function(control){
                if(control.Tag == 'ASSINATURAS'){   
                    assinaturaContentControl = logicDocument.GetContentControl(control.InternalId);
                }
            });

            //Não existe content control de Assinatura - vamos criar.
            if(assinaturaContentControl == null){
                var type = c_oAscSdtLevelType.Block; //Block
                
                var _content_control_pr = new AscCommon.CContentControlPr();
                _content_control_pr.Tag = "ASSINATURAS";
                _content_control_pr.Lock = 3;

                var _obj = Api.asc_AddContentControl(type, _content_control_pr);
                if (!_obj)
                    return undefined;

                //var _obj = Api.pluginMethod_AddContentControl(type, {"Lock" : 3});

                logicDocument.ClearContentControl(_obj.InternalId);

                //assinaturaContentControl = logicDocument.GetContentControl(_obj.InternalId);

                //assinaturaContentControl.Content.ClearContent();

                var scriptAssinatura = createScriptBlockToReplace("ASSINATURAS", "ASSINATURAS", true, _obj.InternalId);

                Api.pluginMethod_InsertAndReplaceContentControls([scriptAssinatura]);
                
                assinaturaContentControl = logicDocument.GetContentControl(_obj.InternalId);
            }       

            //var oDocument = Api.GetDocument();
            //oDocument.InsertWatermark('RASCUNHO', true);

            var firstElement = assinaturaContentControl.Content.GetElement(0);

            //Se o primeiro elemento do content control de assinatura for um paragrafo troca para uma tabela
            /*
            if(firstElement.GetType() == AscCommonWord.type_Paragraph){
                apiOParagraph = Api.private_CreateApiParagraph(firstElement);
                apiOParagraph.RemoveAllElements();
                apiOParagraph.AddText("Hello world!");

                console.log(assinaturaContentControl);

                var oParagraph = assinaturaContentControl.Content.GetElement(0);
            }
            */

            if(firstElement != null && firstElement.GetType() == AscCommonWord.type_Table){
                var tblAssinaturas = firstElement;
                //Verificar se não nenhuma assinatura até o momento
                var pCell00 = tblAssinaturas.Get_Row(0).Get_Cell(0).GetContent(0).GetElement(0);
                if(pCell00.GetText().trim() == 'ASSINATURAS'){
                    var pCell00Api = Api.private_CreateApiParagraph(pCell00)
                    pCell00Api.RemoveAllElements();
                    inserirBlockAssinatura(Api, pCell00Api, data);
                }else{
                    //Já existe assinatura - adicionar nova coluna (célula) no final
                    var row = tblAssinaturas.Get_RowsCount() - 1;
                    var cell = tblAssinaturas.Get_Row(row).Get_CellsCount() - 1;

                    foundedCellEmpty = false;
                    //Procura por alguma célula vazia, se encontra coloca a assinatura nela;
                    for(var i = 0;i < tblAssinaturas.Get_RowsCount();i++){
                        for(var j = 0; j < tblAssinaturas.Get_Row(i).Get_CellsCount();j++){
                            var pCellIJ = tblAssinaturas.Get_Row(i).Get_Cell(j).GetContent(0).GetElement(0);
                            if(pCellIJ.GetAllDrawingObjects().length == 0){
                                foundedCellEmpty = true;
                                row = i;
                                cell = j;
                                break;
                            }
                        }

                        if(foundedCellEmpty) break;
                    }

                    if(!foundedCellEmpty){
                        logicDocument.Start_SilentMode();
                        tblAssinaturas.private_RecalculateGrid();
                        tblAssinaturas.private_UpdateCellsGrid();

                        var newCell = null;
                        //Se já tiver n assinaturas em uma linha, adiciona uma nova linha abaixo
                        //console.log(_assinaturasPorLinha);
                        if(tblAssinaturas.Get_Row(row).Get_CellsCount() == _assinaturasPorLinha){
                            newCell = tblAssinaturas.Content[tblAssinaturas.Content.length - 1].Get_Cell(0);
                            tblAssinaturas.RemoveSelection();
                            tblAssinaturas.CurCell = newCell;
                            tblAssinaturas.AddTableRow(false);
                            row++;
                            cell = 0;
                        }else{
                            newCell = tblAssinaturas.Content[row].Get_Cell(tblAssinaturas.Content[row].Get_CellsCount() - 1);
                            tblAssinaturas.RemoveSelection();
                            tblAssinaturas.CurCell = newCell;
                            tblAssinaturas.AddTableColumn(false);
                            cell++;
                        }

                        logicDocument.End_SilentMode(false);
                    }

                    var lastCellEmpty = tblAssinaturas.Get_Row(row).Get_Cell(cell);

                    var pLastCellEmpty = lastCellEmpty.GetContent(0).GetElement(0);
                    var pLastCellEmptyApi = Api.private_CreateApiParagraph(pLastCellEmpty)
                    //pNewCellApi.RemoveAllElements();
                    inserirBlockAssinatura(Api, pLastCellEmptyApi, data);
                }
            }

            Api.asc_Recalculate();

            var config = {
                closable: false,
                title: "Sucesso",
                msg: "Documento assinado com sucesso!",
                iconCls: 'info',
                buttons: ['ok']
            };
            
            Common.UI.alert(config);
            
            //_contentControl.Content.MoveCursorToEndPos(true, false);                   
            
            //_mainController.api.pluginMethod_InsertAndReplaceContentControls([scriptAssinatura]);


        }

        var createScriptBlockToReplace =  function(Tag, Label, isTextField, InternalId)
        {		
            if(Tag != 'ASSINATURAS'){
                var _script = "\r\n\
                    var oDocument = Api.GetDocument();\r\n\
                    var oParagraph = Api.CreateParagraph();\r\n\
                    var oRun = oParagraph.AddText(\'" + Label + "\');\r\n\
                    oRun.SetColor(255,255,255);\r\n\
                    oRun.SetShd(\"clear\"," + (isTextField ? "0, 0, 255" : "255, 0, 0" ) + ");\r\n\
                    oDocument.InsertContent([oParagraph], true);\r\n\
                    ";
            }else{
                var _script = "\r\n\
                    var oDocument = Api.GetDocument();\r\n\
                    var tblAssinatura = Api.CreateTable(1, 1);\r\n\
                    tblAssinatura.SetWidth('percent', 100);\r\n\
                    var pCell00 = tblAssinatura.GetRow(0).GetCell(0).GetContent().GetElement(0);\r\n\
                    pCell00.SetJc('center');\r\n\
                    var oRun = pCell00.AddText(\'" + Label + "\');\r\n\
                    oRun.SetColor(255,255,255);\r\n\
                    oRun.SetShd(\"clear\"," + (isTextField ? "0, 0, 255" : "255, 0, 0" ) + ");\r\n\
                    oDocument.InsertContent([tblAssinatura], true);\r\n\
                    ";
            }
            _script = _script.replaceAll("\r\n", "");
            _script = _script.replaceAll("\n", "");
            
            var _scriptObject = {
                "Props" : {
                    "Tag"        : Tag,
                    "Lock"       : 3,
                    "InternalId" : InternalId
                },
                "Script" : _script
            };
            
            return _scriptObject;
        }

        var onInit = function(loadConfig) {
        
            //console.log(loadConfig);

            var value = Common.localStorage.getItem("de-settings-autocomplete-atalho");
            if(value === null)
                Common.localStorage.setItem("de-settings-autocomplete-atalho", 0);

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

            if(!_mainController.api.asc_checkNeedCallback('asc_onPluginShow')){
                _mainController.api.asc_registerCallback('asc_onPluginShow', function(plugin){
                    if(plugin.guid === _guidNuclearisMacros){					
                        var _plugin = window.g_asc_plugins.runnedPluginsMap[_guidNuclearisMacros];
                        if (!_plugin)
                            return;

                        _plugin.startData.setAttribute("macros", _mainController.editorConfig.macros);
                        _plugin.startData.setAttribute("macrosDeQuestionario", _mainController.editorConfig.macrosDeQuestionario);
                    }
                });
            }

            //Estatisticas
            _mainController.api.asc_registerCallback('asc_onDocInfo', function(obj){
                if (obj) {
                    if (obj.get_PageCount() > -1)
                        _infoObj.PageCount = obj.get_PageCount();
                    if (obj.get_WordsCount() > -1)
                        _infoObj.WordsCount = obj.get_WordsCount();
                    if (obj.get_ParagraphCount() > -1)
                        _infoObj.ParagraphCount = obj.get_ParagraphCount();
                    if (obj.get_SymbolsCount() > -1)
                        _infoObj.SymbolsCount = obj.get_SymbolsCount();
                    if (obj.get_SymbolsWSCount() > -1)
                        _infoObj.SymbolsWSCount = obj.get_SymbolsWSCount();
                }
            });

            _mainController.api.asc_registerCallback('asc_onGetDocInfoEnd', function(){
                Common.Gateway.metaChange({type: 'docInfo' ,info:  _infoObj});
            });

            var statusbarView = DE.getController('Statusbar').getView('Statusbar');
            statusbarView.$el.find('.status-group:last').prepend('<button id="btn-complete-atalho" type="button" class="btn small btn-toolbar el-edit"><span class="btn-icon" style="background-position: var(--bgX) -920px">&nbsp;</span></button>');
            statusbarView.$el.find('.status-group:last').prepend('<div class="separator short el-edit"></div>');
            var btnCompleteAtalho = new Common.UI.Button({
                el: $('#btn-complete-atalho',statusbarView.el),
                enableToggle: true,
                hint: "Autocompletar atalhos",
                hintAnchor: 'top'
            });

            var currentValueAutocompleteAtalho = Common.localStorage.getItem("de-settings-autocomplete-atalho");
            btnCompleteAtalho.toggle(currentValueAutocompleteAtalho===null || parseInt(currentValueAutocompleteAtalho) == 1, true);

            btnCompleteAtalho.on('click', function() {
                var value = Common.localStorage.getItem("de-settings-autocomplete-atalho");
                console.log(value);
                value = 1 - value;
                Common.localStorage.setItem("de-settings-autocomplete-atalho", value);
                console.log(value);
                btnCompleteAtalho.toggle(value===null || parseInt(value) == 1, true);
            });

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
        
        String.prototype.replaceAll = function(search, replacement) {
            var target = this;
            return target.replace(new RegExp(search, 'g'), replacement);
        };

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