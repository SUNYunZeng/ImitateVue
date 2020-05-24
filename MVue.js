class Watcher{
    // 通过回调函数实现更新的数据通知到视图
    constructor(expr, vm, cb){
        this.expr = expr;
        this.vm = vm;
        this.cb = cb;
        this.oldVal = this.getOldVal();
    }
    // 获取旧数据
    getOldVal(){
        // 在利用getValue获取数据调用getter()方法时先把当前观察者挂载
        Dep.target = this;
        const oldVal = compileUtil.getValue(this.expr, this.vm);
        // 挂载完毕需要注销，防止重复挂载 (数据一更新就会挂载)
        Dep.target = null;
        return oldVal;
    }
    // 通过回调函数更新数据
    update(){
        const newVal = compileUtil.getValue(this.expr, this.vm);
        if(newVal !== this.oldVal){
            this.cb(newVal);
        }
    }
}

// Dep类存储watcher对象，并在数据变化时通知watcher
class Dep{
    constructor(){
        this.watcherCollector = [];
    }
    // 添加watcher
    addWatcher(watcher){
        this.watcherCollector.push(watcher);
    }
    // 数据变化时通知watcher更新
    notify(){
        this.watcherCollector.forEach(w=>w.update());
    }
}

// 定义观察者
class Observer{
    constructor(data){
        this.observe(data);
    }
    // data是一个对象，可能嵌套其它对象，需要采用递归遍历的方式进行观察者绑定
    observe(data){
        if(data && typeof data === 'object'){
            Object.keys(data).forEach(key =>{
                this.defineReactive(data, key, data[key]);
            })
        }
    }
    // 通过 object.defineProperty方法对对象属性进行劫持
    defineReactive(obj, key, value){
        // 递归观察
        this.observe(value);
        const dep = new Dep();
        Object.defineProperty(obj, key, {
            enumerable: true,
            configurable: false,
            get(){
                // 订阅数据变化时，往Dev中添加观察者
                Dep.target && dep.addWatcher(Dep.target);
                return value;
            },
            // 采用箭头函数在定义时绑定this的定义域
            set: (newVal)=>{
                if(value === newVal) return;
                this.observe(newVal);
                value = newVal;
                // 通知watcher数据发生改变
                dep.notify();
            }
        })
    }
}

// 编译模版具体执行
const compileUtil = {
    getValue(expr, vm){
        // 处理 person.name 这种对象类型，取出真正的value
        return expr.split('.').reduce((data,currentVal)=>{
            return data[currentVal];
        }, vm.$data)
    },
    setVal(expr, vm, inputValue){
        let exprs = expr.split('.'), len = exprs.length;
        exprs.reduce((data,currentVal, idx)=>{
            if(idx===len-1){
                data[currentVal] = inputValue;
            }else{
                return data[currentVal]
            }
        }, vm.$data)
    },
    getContent(expr, vm){
        // {{person.name}}--{{person.age}}
        // 防止修改person.name使得所有值全部被替换
        return expr.replace(/\{\{(.+?)\}\}/g, (...args)=>{
            return this.getValue(args[1], vm);
        });
    },
    text(node, expr, vm) {
        let value;
        if(expr.indexOf('{{')!==-1){
            value = expr.replace(/\{\{(.+?)\}\}/g, (...args)=>{
                // text的 Watcher应在此绑定，因为是对插值{{}}进行双向绑定
                // Watcher的构造函数的 getOldVal()方法需要接受数据或者对象，而{{person.name}}不能接收
                new Watcher(args[1], vm, ()=>{
                    this.updater.textUpdater(node, this.getContent(expr, vm));
                });
                return this.getValue(args[1], vm);
            });
        }else{
            value = this.getValue(expr, vm);
        }
        this.updater.textUpdater(node, value);  
    },
    html(node, expr, vm) {
        let value = this.getValue(expr, vm);
        // html对应的 Watcher
        new Watcher(expr, vm, (newVal)=>{
            this.updater.htmlUpdater(node, newVal);
        })
        this.updater.htmlUpdater(node, value);
    },
    model(node, expr, vm) {
        const value = this.getValue(expr, vm);
        // v-model绑定对应的 Watcher, 数据驱动视图
        new Watcher(expr, vm, (newVal)=>{
            this.updater.modelUpdater(node, newVal);
        });
        // 视图 => 数据 => 视图
        node.addEventListener('input', (e)=>{
            this.setVal(expr, vm, e.target.value);
        })
        this.updater.modelUpdater(node, value);
    },
    on(node, expr, vm, detailStr) {
        let fn = vm.$options.methods && vm.$options.methods[expr];
        node.addEventListener(detailStr,fn.bind(vm), false);
    },
    bind(node, expr, vm, detailStr){
        // v-on:href='...' => href='...'
        node.setAttribute(detailStr, expr);
    },
    // 视图更新函数
    updater: {
        textUpdater(node, value) {
            node.textContent = value;
        },
        htmlUpdater(node, value){
            node.innerHTML = value;
        },
        modelUpdater(node, value){
            node.value = value;
        }
    }

}

// 编译HTML模版对象
class Compiler {
    constructor(el, vm) {
        this.el = this.isElementNode(el) ? el : document.querySelector(el);
        this.vm = vm;
        // 1. 将预编译的元素节点放入文档碎片对象中，避免DOM频繁的回流与重绘，提高渲染性能
        const fragments = this.node2fragments(this.el);
        // 2. 编译模版
        this.compile(fragments);
        // 3. 追加子元素到根元素
        this.el.appendChild(fragments);
    }
    compile(fragments) {
        // 1.获取子节点
        const childNodes = fragments.childNodes;
        // 2.递归循环编译
        [...childNodes].forEach(child => {
            // 如果是元素节点
            if (this.isElementNode(child)) {
                this.compileElement(child);
            } else {
                // 文本节点
                this.compileText(child);
            }
            //递归遍历
            if(child.childNodes && child.childNodes.length){
                this.compile(child);
            }
        })
    }
    compileElement(node) {
        let attributes = node.attributes;
        // 对于每个属性进行遍历编译
        // attributes是类数组，因此需要先转数组
        [...attributes].forEach(attr => {
            let {name,value} = attr; // v-text="msg"  v-html=htmlStr  type="text"  v-model="msg"
            if (this.isDirector(name)) { // v-text  v-html  v-mode  v-bind  v-on:click v-bind:href=''
                let [, directive] = name.split('-');
                let [compileKey, detailStr] = directive.split(':');
                // 更新数据，数据驱动视图
                compileUtil[compileKey](node, value, this.vm, detailStr);
                // 删除有指令的标签属性 v-text v-html等，普通的value等原生html标签不必删除
                node.removeAttribute('v-' + directive);
            }else if(this.isEventName(name)){
                // 如果是事件处理 @click='handleClick'
                let [, detailStr] = name.split('@');
                compileUtil['on'](node, value, this.vm, detailStr);
                node.removeAttribute('@' + detailStr);
            }

        })

    }
    compileText(node) {
        // 编译文本中的{{person.name}}--{{person.age}}
        const content = node.textContent;
        if(/\{\{(.+?)\}\}/.test(content)){
            compileUtil['text'](node, content, this.vm);
        }
    }
    isEventName(attrName){
        // 判断是否@开头
        return attrName.startsWith('@');
    }
    isDirector(attrName) {
        // 判断是否为Vue特性标签
        return attrName.startsWith('v-');
    }
    node2fragments(el) {
        // 创建文档碎片对象
        const f = document.createDocumentFragment();
        let firstChild;
        while (firstChild = el.firstChild) {
            f.appendChild(firstChild);
        }
        return f;
    }
    isElementNode(node) {
        // 元素节点的nodeType属性为 1
        return node.nodeType === 1;
    }
}


class MVue {
    constructor(options) {
        // 初始元素与数据通过options对象绑定
        this.$el = options.el;
        this.$data = options.data;
        this.$options = options;
        // 通过Compiler对象对模版进行编译，例如{{}}插值、v-text、v-html、v-model等Vue语法
        if (this.$el) {
            // 1. 创建观察者
            new Observer(this.$data);
            // 2. 编译模版
            new Compiler(this.$el, this);
            // 3. 通过数据代理实现 this.person.name = '海贼王——路飞'功能，而不是this.$data.person.name = '海贼王——路飞'
            this.proxyData(this.$data);
        }
    }
     //用vm代理vm.$data
     proxyData(data){
        for(let key in data){
            Object.defineProperty(this,key,{
                get(){
                    return data[key];
                },
                set(newVal){
                    data[key] = newVal;
                }
            })
        }
    }
}
