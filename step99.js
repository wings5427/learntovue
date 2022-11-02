
// 虚拟Dom
var vDom = {}
// 用于保存mode和view的映射关系
var bindingPropMap = new Map()

// 初始化
function init(rootElementId, tmpPath) {
    // 执行组件加载前的回调方法
    scripts.beforeLoad()
    //使用proxy创建代理
    this.data = observer(data)
    let xhr = new XMLHttpRequest()
    xhr.open('GET', tmpPath + '?' + new Date().valueOf())
    xhr.send()
    xhr.onreadystatechange = function () {
        if (xhr.readyState === 4 && xhr.status === 200) {
            console.log(xhr.responseText)
            // 解析html模板得到虚拟Dom
            let domParser = new DOMParser();
            let html = domParser.parseFromString(xhr.responseText, "text/html")
            parseNode(html.body, vDom)
            // 获取Dom根节点并设置事件委托
            let rootElement = document.getElementById(rootElementId)
            rootElement.onclick = onEvent
            // 根据虚拟Dom生成Dom节点
            makeDomTree(rootElement, vDom)
        }
    }


}

// 属性代理（监听对象属性的变化）
function observer(target) {
    const proxy = new Proxy(target, {
        set(target, prop, value) {
            // 设置对象属性
            console.log('setter>>>', prop, target[prop], value)
            if (target[prop] == value) {
                return true
            }
            let result = true
            if (Array.isArray(value) && Array.isArray(target[prop])) {
                // 数组对象的数据变化
                target[prop].splice(0, target[prop].length)
                for (item of value) {
                    target[prop].push(item)
                }
            } else {
                // 其它类型的数据变化
                result = Reflect.set(target, prop, value)
            }
            if (result == true) {
                // 数据更新成功后，根据虚拟Dom更新Dom节点
                updateDomTree(prop)
            }
            console.log('setter<<<', prop, target[prop], value)
            return result
        },
        get(target, prop) {
            // 获取对象属性
            // console.log('getter ', prop)
            return Reflect.get(target, prop)
        },
        // 代理的目标,上下文,参数
        apply(target, ctx, args) {
            console.log(target, ctx, args)
            return target(...args)
        }
    })
    return proxy;
}

// 事件委托（适合事件委托的事件有： click ， mousedown ， mouseup ， keydown ， keyup ， keypress）
var onEvent = function (event) {
    // console.log(event.target)
    console.log('事件代理:', event.type, ' src:', event.srcElement)
    // console.log(event.type)
    //console.log(event)
    let vNode = findVNodeById(vDom, event.target.id)
    if (vNode == undefined || vNode == null || vNode.events == undefined || vNode.events == null) {
        return
    }

    // 根据虚拟Dom将视图上的数据同步到模型中
    syncFromViewToMode(vDom)

    // 根据虚拟Dom调用事件处理程序
    let process = vNode.events[event.type]
    console.log(scripts)
    if (process != null && process != undefined) {
        eval(`scripts.${process}(event)`)
    }
}

// 根据虚拟Dom生成Dom节点
function makeDomTree(rootElement, virElement) {
    for (let propKey in virElement) {
        let vNode = virElement[propKey];
        console.log(vNode.originHtml)
        let index = 0
        let nodeCount = 1
        if (vNode.commands != undefined && vNode.commands != null) {
            //有绑定的指令，暂时只处理for
            nodeCount = eval(`data.${vNode.commands.vFor}.length`)
        }
        for (index = 0; index < nodeCount; index++) {
            let domNode = document.createElement(vNode.element);
            let id = propKey + (nodeCount <= 1 ? "" : "_" + index)
            domNode.setAttribute('id', id)
            for (let attributeKey in vNode.attributes) {
                let attributeCondition = vNode.attributes[attributeKey]
                console.log(attributeKey, attributeCondition)
                // 将数据模型中的值设置到真实Dom节点的对应属性上
                domNode.setAttribute(attributeKey, conditionEval(attributeCondition, data, index))
                //绑定数据模型中的属性与虚拟Dom节点的对应关系
                bindingModeAndVNode(attributeCondition, vNode)
            }
            if (vNode.innerText != null && vNode.innerText != undefined) {
                domNode.innerText = conditionEval(vNode.innerText, data, index)
            }
            rootElement.appendChild(domNode)
            // 递归子节点
            if (vNode.childs != null) {
                makeDomTree(domNode, vNode.childs)
            }
        }
    }
}

// 根据虚拟Dom更新Dom节点
// 应该对比新旧数据的差异，更新差异节点对应的虚拟Dom和真实Dom节点，此处简化为全部重新创建
function updateDomTree(modelPropName) {
    let vNodeSet = bindingPropMap.get(parseModelPropName(modelPropName))
    for (let vNode of vNodeSet) {
        console.log('更新Dom src:', vNode.originHtml)
        let index = 0
        let nodeCount = 1
        let parentElement = null
        let domNode = null
        if (vNode.commands != undefined && vNode.commands != null) {
            //有绑定的指令，暂时只处理for
            nodeCount = eval(`data.${vNode.commands.vFor}.length`)
            //应该对比新旧数据的差异，更新差异节点对应的虚拟Dom和真实Dom节点，此处简化为全部重新创建
            let id = vNode.id + "_0"
            parentElement = document.getElementById(id).parentNode
            let relNodes = parentElement.childNodes
            for (let index = relNodes.length - 1; index >= 0; index--) {
                relNodes[index].remove()
            }
        }
        for (index = 0; index < nodeCount; index++) {
            let id = vNode.id + (nodeCount <= 1 ? "" : "_" + index)
            if (parentElement != null) {
                domNode = document.createElement(vNode.element)
                domNode.setAttribute('id', id)
                parentElement.appendChild(domNode)
            } else {
                domNode = document.getElementById(id)
            }

            for (let attributeKey in vNode.attributes) {
                let attributeCondition = vNode.attributes[attributeKey]
                let attributeValue = conditionEval(attributeCondition, data, index)
                console.log('更新Dom', '属性名：', attributeKey, '绑定表达式：', attributeCondition, '表达式求值', attributeValue)
                // 将数据模型中的值设置到真实Dom节点的对应属性上
                if (attributeKey.trim() == 'value') {
                    // value属性用setAttribute方法不生效
                    domNode.value = attributeValue
                } else {
                    domNode.setAttribute(attributeKey, attributeValue)
                }
                //绑定数据模型中的属性与虚拟Dom节点的对应关系
                // bindingModeAndVNode(attributeCondition, vNode)
            }
            if (vNode.innerText != null && vNode.innerText != undefined) {
                domNode.innerText = conditionEval(vNode.innerText, data, index)
            }
            // 递归子节点
            if (vNode.childs != null) {
                makeDomTree(domNode, vNode.childs)
            }
        }
    }
}

// 根据虚拟Dom将视图上的数据同步到模型中
function syncFromViewToMode(rootVNode) {
    for (let propKey in rootVNode) {
        // console.log(propKey)
        let vNode = rootVNode[propKey]
        let domNode = document.getElementById(propKey)
        if (vNode.attributes != undefined && vNode.attributes != undefined) {
            for (let attributeKey in vNode.attributes) {
                let attributeValueCondition = vNode.attributes[attributeKey].trim()
                if (isCondition(attributeValueCondition)) {
                    // 有数据绑定，进行数据同步
                    attributeValueCondition = parseModelPropName(attributeValueCondition)
                    if (Array.isArray(data[attributeValueCondition])) {
                        // 暂时不处理数组类型的数据同步
                        continue
                    }
                    console.log('视图上的数据同步到模型', vNode.originHtml, 'dom属性：', attributeKey, '模型属性：', attributeValueCondition, '值：(', data[attributeValueCondition], '=>', domNode[attributeKey], ')')
                    data[attributeValueCondition] = domNode[attributeKey]
                }
            }
        }
        if (vNode.childs != undefined && vNode.childs != null) {
            // 递归处理子节点
            syncFromViewToMode(vNode.childs)
        }
    }
}

// 通过ID查找对应的虚拟Dom节点
function findVNodeById(rootNode, id) {
    for (let subNodeId in rootNode) {
        let subNode = rootNode[subNodeId]
        if (subNodeId == id) {
            return subNode
        }
        if (subNode.childs != null && subNode.childs != undefined) {
            // 有子节点，递归查找
            let targetNode = findVNodeById(subNode.childs, id)
            if (targetNode != null) {
                return targetNode
            }
        }
    }
    // 没找到
    return null
}

//绑定数据模型中的属性与虚拟Dom节点的对应关系（需要处理一对多的情况)
function bindingModeAndVNode(condition, vNode) {
    if (isCondition(condition)) {
        let modePropName = parseModelPropName(condition)
        // 绑定属性名与虚拟Dom节点的对应关系
        if (bindingPropMap.has(modePropName)) {
            //一对多的情况
            bindingPropMap.get(modePropName).add(vNode)
        } else {
            bindingPropMap.set(modePropName, new Set([vNode]))
        }
    }
}

// 基本的工具方法
// 判断是否是自定义的表达式
function isCondition(condition) {
    return (condition.indexOf('{{') == 0 && condition.indexOf('}}') == condition.length - 2)
}
// 对自定义的表达式进行求值
function conditionEval(condition, data, index) {
    condition = condition.trim()
    if (isCondition(condition)) {
        let attributeValueCondition = condition.slice(2, condition.length - 2)
        return eval('data.' + attributeValueCondition)
    } else {
        return condition
    }
}
// 解析出自定义表达式中的属性名
function parseModelPropName(condition) {
    let modePropName = condition
    if (condition.indexOf('{{') == 0 && condition.indexOf('}}') == condition.length - 2) {
        // 计算表达式中包含的数据模型中的属性名
        modePropName = condition.slice(2, condition.length - 2)
    }
    let index = modePropName.indexOf('[')
    if (index >= 0) {
        modePropName = modePropName.slice(0, index)
    }
    index = modePropName.indexOf('.')
    if (index >= 0) {
        modePropName = modePropName.slice(0, index)
    }
    return modePropName
}

// html模板解析
function parseNode(htmlNode, virNode, parentVirNod = null, autoId = 0) {
    for (let htmlChildNode of htmlNode.childNodes) {
        console.log('template', htmlChildNode)
        // console.log(childNode.nodeName)
        if (htmlChildNode.nodeType == 3) {
            if (parentVirNod != null) {
                let htmlText = htmlChildNode.nodeValue.trim()
                if (htmlText.length > 0) {
                    parentVirNod.innerText = htmlText
                }
            }
            continue
        }
        let id = htmlChildNode.id
        if (id == null || id == undefined || id.length < 1) {
            id = 'auto_' + (++autoId)
        }
        let childVirNode = { id: id, originHtml: htmlChildNode, element: htmlChildNode.nodeName, attributes: {}, innerText: '', events: {}, childs: {} }
        virNode[id] = childVirNode
        for (let attribute of htmlChildNode.attributes) {
            // console.log(attribute.name)
            // console.log(attribute.value)
            if (attribute.name.startsWith('@')) {
                // 绑定的事件
                let eventName = attribute.name.slice(1, attribute.name.length) // 获取事件名
                let eventFuncName = attribute.value
                childVirNode.events[eventName] = eventFuncName
            } else if (attribute.name.startsWith('v-')) {
                // 绑定的指令,当前只支持一个指令，这里直接硬编码指令名
                childVirNode.commands = { 'vFor': attribute.value }
            } else {
                // 正常的属性
                childVirNode.attributes[attribute.name] = attribute.value
            }
        }
        console.log('vDom', childVirNode)
        if (htmlChildNode.childNodes.length > 0) {
            autoId = parseNode(htmlChildNode, childVirNode.childs, childVirNode, autoId)
        } else {
            childVirNode.childs = null
        }
    }
    return autoId
}